"""Export matching print parts from the saved press frames, without re-solving FEA.

Run with Python + VTK, NumPy and SciPy (or Slicer's Python). Frame surfaces
store original coordinates and owning element IDs. Their boundaries partition
the original tetrahedra exactly; display displacements are never applied.
"""
import argparse
import hashlib
import heapq
import json
from pathlib import Path
import zipfile

import numpy as np
from scipy.sparse import coo_matrix
from scipy.sparse.csgraph import connected_components
import vtk
from vtk.util.numpy_support import numpy_to_vtk, numpy_to_vtkIdTypeArray, vtk_to_numpy

from export_print_mesh import inspect_surface


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def boundary_faces(tets):
    faces = tets[:, [[1, 2, 3], [0, 3, 2], [0, 1, 3], [0, 2, 1]]].reshape(-1, 3)
    _, first, counts = np.unique(np.sort(faces, axis=1), axis=0, return_index=True, return_counts=True)
    return faces[first[counts == 1]]


def pinches(faces):
    """Detect nonmanifold edges and vertices (multiple surface fans at a point)."""
    edges = np.concatenate((faces[:, [0, 1]], faces[:, [1, 2]], faces[:, [2, 0]]))
    unique, counts = np.unique(np.sort(edges, axis=1), axis=0, return_counts=True)
    bad_edges = unique[counts != 2]
    if len(bad_edges):
        return bad_edges, []
    links = {}
    for a, b, c in faces:
        links.setdefault(a, []).append((b, c))
        links.setdefault(b, []).append((a, c))
        links.setdefault(c, []).append((a, b))
    bad_vertices = []
    for vertex, pairs in links.items():
        adjacent = {}
        for a, b in pairs:
            adjacent.setdefault(a, []).append(b)
            adjacent.setdefault(b, []).append(a)
        visited, stack = set(), [next(iter(adjacent))]
        while stack:
            node = stack.pop()
            if node not in visited:
                visited.add(node)
                stack.extend(adjacent[node])
        if len(visited) != len(adjacent):
            bad_vertices.append(vertex)
    return bad_edges, bad_vertices


class TetMesh:
    def __init__(self, points, tets):
        self.points, self.tets = points, tets
        self.volumes = np.linalg.det(points[tets[:, 1:]] - points[tets[:, :1]]) / 6
        if not np.isfinite(points).all() or np.any(self.volumes <= 0):
            raise ValueError('Expected finite coordinates and positive tetrahedra.')
        faces = tets[:, [[1, 2, 3], [0, 3, 2], [0, 1, 3], [0, 2, 1]]].reshape(-1, 3)
        self.keys, inverse, counts = np.unique(np.sort(faces, axis=1), axis=0, return_inverse=True, return_counts=True)
        if np.any(counts > 2):
            raise ValueError('The source volume mesh has nonmanifold faces.')
        order, offsets = np.argsort(inverse, kind='stable'), np.r_[0, np.cumsum(counts)]
        shared = np.where(counts == 2)[0]
        self.shared = shared
        self.a, self.b = order[offsets[shared]] // 4, order[offsets[shared] + 1] // 4
        self.face_lookup = {tuple(face): i for i, face in enumerate(self.keys)}
        # write_frame stores coordinates as Float32. Match that exact conversion.
        self.point_lookup = {tuple(point): i for i, point in enumerate(points.astype(np.float32))}
        if len(self.point_lookup) != len(points):
            raise ValueError('Float32 frame coordinates are not uniquely identifiable.')

    def labels(self, connections):
        graph = coo_matrix((np.ones(np.sum(connections)), (self.a[connections], self.b[connections])),
                           shape=(len(self.tets), len(self.tets)))
        return connected_components(graph, directed=False)[1]

    def recover_removed(self, surface):
        coords = vtk_to_numpy(surface.GetPoints().GetData())
        ids = np.array([self.point_lookup[tuple(point)] for point in coords])
        faces = ids[vtk_to_numpy(surface.GetPolys().GetConnectivityArray()).reshape(-1, 3)]
        keys = np.sort(faces, axis=1)
        boundary = np.array([self.face_lookup[tuple(face)] for face in keys])
        owners = vtk_to_numpy(surface.GetCellData().GetArray('element_id')).astype(int)
        if np.any(owners < 0) or np.any(owners >= len(self.tets)) or not all(
            set(face).issubset(self.tets[owner]) for face, owner in zip(faces, owners)
        ):
            raise ValueError('Frame surface owners do not match the source tetrahedra.')
        labels = self.labels(~np.isin(self.shared, boundary))
        visible = np.isin(labels, labels[owners])
        expected = {tuple(face) for face in keys}
        actual = {tuple(face) for face in np.sort(boundary_faces(self.tets[visible]), axis=1)}
        if len(expected) != len(keys) or actual != expected:
            raise ValueError('Recovered elements do not reproduce the entire saved frame boundary.')
        return ~visible

    def components(self, selection):
        labels = self.labels(selection[self.a] == selection[self.b])
        pieces = [np.where(selection & (labels == label))[0] for label in np.unique(labels[selection])]
        return sorted(pieces, key=lambda ids: -self.volumes[ids].sum())

    def repair(self, removed, min_fragment_volume=0.0):
        """Absorb pinched slivers into the insert; never move a vertex or lose volume.

        Keep the largest face-connected remaining fan around each pinch, or
        connect missing fans through a minimum-volume local path. This is a
        documented print-only partition adjustment, not a new damage result.
        """
        selected = removed.copy()
        for iteration in range(100):
            for piece in self.components(~selected):
                if self.volumes[piece].sum() < min_fragment_volume:
                    selected[piece] = True
            bad_edges, bad_vertices = set(), set()
            for group in (selected, ~selected):
                for piece in self.components(group):
                    edges, vertices = pinches(boundary_faces(self.tets[piece]))
                    bad_edges.update(tuple(edge) for edge in edges)
                    bad_vertices.update(vertices)
            if not bad_edges and not bad_vertices:
                return selected, iteration
            before = selected.copy()
            # Stable ordering makes the print partition reproducible.
            for nodes in [*sorted(bad_edges), *((v,) for v in sorted(bad_vertices))]:
                incident = np.ones(len(selected), dtype=bool)
                for node in nodes:
                    incident = incident & np.any(self.tets == node, axis=1)
                ids = np.where(incident)[0]
                remaining = ~selected[ids]
                if not np.any(remaining):
                    continue
                local = self.tets[ids]
                adjacent = np.array([[len(set(x) & set(y)) == 3 for y in local] for x in local])
                visible_ids = ids[remaining]
                count, labels = connected_components(coo_matrix(adjacent[np.ix_(remaining, remaining)]), directed=False)
                if count > 1:
                    largest = np.argmax([self.volumes[visible_ids[labels == label]].sum() for label in range(count)])
                    selected[visible_ids[labels != largest]] = True
                else:
                    missing_local = np.where(~remaining)[0]
                    count, labels = connected_components(coo_matrix(adjacent[np.ix_(~remaining, ~remaining)]), directed=False)
                    if count <= 1:
                        selected[visible_ids] = True
                        continue
                    # Multi-source Dijkstra joins two missing fans with the
                    # least added tetrahedral volume, avoiding a large star fill.
                    sources = set(missing_local[labels == 0])
                    targets = set(missing_local[labels != 0])
                    distances = {node: 0.0 for node in sources}
                    previous, queue = {}, [(0.0, node) for node in sources]
                    heapq.heapify(queue)
                    while queue:
                        cost, node = heapq.heappop(queue)
                        if cost > distances[node]:
                            continue
                        if node in targets:
                            while node not in sources:
                                selected[ids[node]] = True
                                node = previous[node]
                            break
                        for neighbor in np.where(adjacent[node])[0]:
                            candidate = cost + (self.volumes[ids[neighbor]] if remaining[neighbor] else 0)
                            if candidate < distances.get(neighbor, float('inf')):
                                distances[neighbor], previous[neighbor] = candidate, node
                                heapq.heappush(queue, (candidate, neighbor))
                    else:
                        raise ValueError('Disconnected tetrahedral star at a pinched vertex.')
            if np.array_equal(before, selected) or np.all(selected):
                raise ValueError('Could not repair the print partition without consuming the bone.')
        raise ValueError('Print partition repair did not converge.')


def polydata(points, faces):
    ids, local = np.unique(faces, return_inverse=True)
    local = local.reshape(-1)
    surface = vtk.vtkPolyData()
    vtk_points = vtk.vtkPoints()
    vtk_points.SetData(numpy_to_vtk(points[ids], deep=True))
    cells = vtk.vtkCellArray()
    cells.SetData(numpy_to_vtkIdTypeArray(np.arange(0, len(local) + 1, 3, dtype=np.int64), deep=True),
                  numpy_to_vtkIdTypeArray(local.astype(np.int64), deep=True))
    surface.SetPoints(vtk_points)
    surface.SetPolys(cells)
    return surface


def write_stl(path, points, faces, volume):
    surface = polydata(points, faces)
    before = inspect_surface(surface)
    if not np.isclose(before['volume_mm3'], volume, rtol=1e-8):
        raise ValueError('Surface volume does not match its tetrahedra.')
    if len(pinches(faces)[1]):
        raise ValueError('Print surface has pinched vertices.')
    writer = vtk.vtkSTLWriter()
    writer.SetInputData(surface)
    writer.SetFileTypeToBinary()
    writer.SetHeader('HFValid Pat001; mm; undeformed reconstruction model; CC BY 4.0')
    writer.SetFileName(str(path))
    if not writer.Write():
        raise RuntimeError(f'Could not write {path.name}.')
    reader = vtk.vtkSTLReader()
    reader.SetFileName(str(path)); reader.Update()
    result = inspect_surface(reader.GetOutput())
    if result['triangles'] != before['triangles'] or not np.allclose(result['dimensions_mm'], before['dimensions_mm'], atol=1e-4, rtol=0) or not np.isclose(result['volume_mm3'], volume, rtol=1e-5):
        raise ValueError('STL round-trip changed the part.')
    if path.stat().st_size != 84 + 50 * result['triangles']:
        raise ValueError('Invalid binary STL length.')
    result.update(file=path.name, sha256=digest(path), bytes=path.stat().st_size, nonmanifold_vertices=0)
    return result


def export_reconstruction(models, output):
    source = models / 'hfvalid-femur/bone-fea.vtu'
    manifest_path = models / 'femur-press/manifest.json'
    manifest = json.loads(manifest_path.read_text(encoding='utf-8'))
    if digest(source) != manifest['source_mesh_sha256']:
        raise ValueError('The simulation uses a different source mesh.')
    reader = vtk.vtkXMLUnstructuredGridReader()
    reader.SetFileName(str(source)); reader.Update()
    grid = reader.GetOutput()
    if not grid.GetNumberOfCells() or np.any(vtk_to_numpy(grid.GetCellTypesArray()) != vtk.VTK_TETRA):
        raise ValueError('Expected a tetrahedral volume mesh.')
    mesh = TetMesh(vtk_to_numpy(grid.GetPoints().GetData()).astype(float),
                   vtk_to_numpy(grid.GetCells().GetConnectivityArray()).reshape(-1, 4))
    print_info = json.loads((models / 'hfvalid-femur/bone-print.json').read_text(encoding='utf-8'))
    translation = np.array(print_info['translation_mm'])
    points = mesh.points + translation
    output.mkdir(parents=True, exist_ok=True)
    frames = []
    previous_removed = np.zeros(len(mesh.tets), dtype=bool)
    for index, frame in enumerate(manifest['frames']):
        path = models / 'femur-press' / frame['file']
        reader = vtk.vtkXMLPolyDataReader()
        reader.SetFileName(str(path)); reader.Update()
        removed = mesh.recover_removed(reader.GetOutput())
        raw_volume = float(mesh.volumes[removed].sum())
        if np.any(previous_removed & ~removed) or not np.isclose(raw_volume / mesh.volumes.sum() * 100, frame['eroded_volume_percent'], atol=1e-9, rtol=0):
            raise ValueError('Recovered removal differs from the recorded FEA history.')
        previous_removed = removed
        if not np.any(removed):
            continue
        printable, iterations = mesh.repair(removed, min_fragment_volume=5.0)
        added = np.where(printable & ~removed)[0]
        parts = []
        for kind, selection in [('missing', printable), ('remaining', ~printable)]:
            for number, ids in enumerate(mesh.components(selection), start=1):
                name = f'step-{index + 1:02d}-{kind}-{number}.stl'
                report = write_stl(output / name, points, boundary_faces(mesh.tets[ids]), float(mesh.volumes[ids].sum()))
                report.update(kind=kind, label=f'{"Missing region" if kind == "missing" else "Remaining femur"} {number}', elements=len(ids))
                parts.append(report)
        # Complementary cell sets guarantee matching faces, no volumetric overlap,
        # and full coverage. Also independently check the exported volumes.
        if not np.isclose(sum(part['volume_mm3'] for part in parts), mesh.volumes.sum(), rtol=1e-5):
            raise ValueError('Exported parts do not reconstruct the original bone volume.')
        report = {
            'frame_index': index, 'step': index + 1, 'stroke_mm': frame['stroke_mm'],
            'units': 'mm', 'scale': 1, 'coordinate_state': 'original undeformed geometry',
            'translation_mm': translation.tolist(), 'clearance_mm': 0,
            'source_mesh_sha256': digest(source), 'source_frame_sha256': digest(path),
            'raw_removed_elements': int(removed.sum()), 'raw_removed_volume_mm3': raw_volume,
            'raw_eroded_volume_percent': frame['eroded_volume_percent'],
            'print_insert_volume_mm3': float(mesh.volumes[printable].sum()),
            'repair_added_elements': added.tolist(), 'repair_added_volume_mm3': float(mesh.volumes[added].sum()),
            'repair_iterations': iterations, 'source_volume_mm3': float(mesh.volumes.sum()),
            'minimum_remaining_fragment_mm3': 5.0,
            'checks': {'saved_boundary_reproduced': True, 'recorded_eroded_volume_matched': True,
                       'complementary_partition': True, 'stl_roundtrip': True},
            'parts': parts, 'report_file': f'step-{index + 1:02d}-report.json',
            'bundle_file': f'step-{index + 1:02d}-reconstruction.zip',
            'source_url': manifest['source_url'], 'license': print_info['license'],
            'attribution': print_info['attribution'],
        }
        (output / report['report_file']).write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
        instructions = (
            f"HFValid Pat001 reconstruction model - step {index + 1}\n\n"
            "Coordinates: millimeters, original undeformed geometry, scale 1:1.\n"
            "All STLs share one translation. Import them together as parts of one object to inspect assembly.\n"
            "For printing, arrange parts on the plate and apply the SAME uniform scale to every part.\n"
            "No fit clearance is applied; printer tolerances and assembly access must be checked.\n"
            "Inspect thin features and small parts in the slicer; choose orientation and supports.\n"
            "The original full femur is approximately 397 mm tall; 50% is approximately 198.5 mm.\n\n"
            f"Print repair adds {report['repair_added_volume_mm3']:.3f} mm3 to the simulated missing region.\n"
            "Those elements are removed from the matching remaining pieces. No vertex is moved or smoothed.\n"
            "Remaining fragments below 5 mm3 are absorbed into the insert, and counted in the repair volume.\n"
            "Use this matching set; the separate intact STL uses a different surface resolution.\n"
            "This is a physical model of simulated element erosion, not an implant or actual missing tissue.\n\n"
            f"{print_info['attribution']}\n{manifest['source_url']}\nLicense: {print_info['license']}\n"
        )
        with zipfile.ZipFile(output / report['bundle_file'], 'w', zipfile.ZIP_DEFLATED) as bundle:
            for part in parts:
                bundle.write(output / part['file'], part['file'])
            bundle.write(output / report['report_file'], report['report_file'])
            bundle.writestr('PRINT-README.txt', instructions)
        frames.append(report)
        print(f"Step {index + 1}: {len(parts)} parts; repair +{report['repair_added_volume_mm3']:.3f} mm3", flush=True)
    info = {'case_id': manifest['case_id'], 'units': 'mm', 'simulation_manifest_sha256': digest(manifest_path),
            'repair_method': 'Absorb pinched edge/vertex slivers into insert; retain complementary remaining pieces; no smoothing or scaling.',
            'frames': frames}
    (output / 'manifest.json').write_text(json.dumps(info, indent=2) + '\n', encoding='utf-8')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    models = Path(__file__).resolve().parents[2] / 'public/models'
    parser.add_argument('--models', type=Path, default=models)
    parser.add_argument('--output', type=Path, default=models / 'femur-reconstruction')
    args = parser.parse_args()
    export_reconstruction(args.models, args.output)
