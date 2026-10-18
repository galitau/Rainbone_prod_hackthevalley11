"""Solve and export the hydraulic press demonstration, one VTP per load step."""
import argparse
import base64
import hashlib
import json
from pathlib import Path
import xml.etree.ElementTree as ET

import meshio
import numpy as np

from press_solver import PressSolver, failure_ratio, damage_law, strain_averaging_matrix
from solve import surface_faces


def vtk_array(parent, name, values, components=1, integer=False):
    values = np.asarray(values, dtype='<i4' if integer else '<f4')
    raw = values.tobytes()
    node = ET.SubElement(parent, 'DataArray', type='Int32' if integer else 'Float32', Name=name,
                         NumberOfComponents=str(components), format='binary')
    node.text = base64.b64encode(np.asarray([len(raw)], dtype='<u4').tobytes() + raw).decode('ascii')


def write_frame(path, points, tets, result, damage, volumes, failure_index, eligible):
    # Erode only the rendered surface. The solver keeps 0.5% residual stiffness.
    visible = damage < .95
    faces, owners = surface_faces(points, tets[visible])
    owners = np.where(visible)[0][owners]
    ids, inverse = np.unique(faces, return_inverse=True)
    weights = np.zeros(len(points))
    nodal_stress = np.zeros(len(points))
    nodal_damage = np.zeros(len(points))
    nodal_failure = np.zeros(len(points))
    for corner in range(4):
        np.add.at(weights, tets[:, corner], volumes)
        np.add.at(nodal_stress, tets[:, corner], volumes * result['von_mises'])
        np.maximum.at(nodal_damage, tets[:, corner], damage)
        np.maximum.at(nodal_failure, tets[:, corner], failure_index)
    nodal_stress /= weights
    # Lighting normals on the deformed surface; geometry positions are kept
    # undeformed in the file, with solved displacements for the renderer.
    deformed = points + result['displacement']
    triangles = deformed[faces]
    face_normals = np.cross(triangles[:, 1] - triangles[:, 0], triangles[:, 2] - triangles[:, 0])
    normals = np.zeros_like(points)
    for corner in range(3):
        np.add.at(normals, faces[:, corner], face_normals)
    normals /= np.maximum(np.linalg.norm(normals, axis=1, keepdims=True), 1e-30)
    root = ET.Element('VTKFile', type='PolyData', version='0.1', byte_order='LittleEndian', header_type='UInt32')
    piece = ET.SubElement(ET.SubElement(root, 'PolyData'), 'Piece', NumberOfPoints=str(len(ids)),
        NumberOfPolys=str(len(faces)), NumberOfVerts='0', NumberOfLines='0', NumberOfStrips='0')
    vtk_array(ET.SubElement(piece, 'Points'), 'Points', points[ids], 3)
    cells = ET.SubElement(piece, 'Polys')
    vtk_array(cells, 'connectivity', inverse.reshape(-1, 3), integer=True)
    vtk_array(cells, 'offsets', np.arange(1, len(faces) + 1) * 3, integer=True)
    pd = ET.SubElement(piece, 'PointData', Scalars='stress_mpa', Normals='Normals', Vectors='displacement')
    vtk_array(pd, 'Normals', normals[ids], 3)
    vtk_array(pd, 'displacement', result['displacement'][ids], 3)
    vtk_array(pd, 'displacement_mm', np.linalg.norm(result['displacement'][ids], axis=1))
    vtk_array(pd, 'stress_mpa', nodal_stress[ids])
    vtk_array(pd, 'damage', nodal_damage[ids])
    vtk_array(pd, 'failure_index', nodal_failure[ids])
    cd = ET.SubElement(piece, 'CellData')
    vtk_array(cd, 'element_id', owners, integer=True)
    vtk_array(cd, 'element_stress_mpa', result['von_mises'][owners])
    vtk_array(cd, 'element_failure_index', failure_index[owners])
    vtk_array(cd, 'element_failure_eligible', eligible[owners], integer=True)
    ET.ElementTree(root).write(path, encoding='utf-8', xml_declaration=True)
    return float(nodal_stress[ids].max())


def stress_color_scale(output, frames):
    """One fixed scale across steps, excluding isolated nodal stress outliers.

    Actual peaks remain in the report and all values remain in each VTP.
    """
    for frame in frames:
        node = ET.parse(output / frame['file']).find("./PolyData/Piece/PointData/DataArray[@Name='stress_mpa']")
        values = np.frombuffer(base64.b64decode(node.text)[4:], dtype='<f4')
        frame['nodal_stress_p99_mpa'] = float(np.percentile(values, 99))
    return max(frame['nodal_stress_p99_mpa'] for frame in frames)


def main(output, max_iterations, checkpoint=None):
    root = Path(__file__).resolve().parents[2]
    source = root / 'public/models/hfvalid-femur/bone-fea.vtu'
    signature = hashlib.sha256(source.read_bytes() + Path(__file__).read_bytes()
        + Path(__file__).with_name('press_solver.py').read_bytes()).hexdigest()
    mesh = meshio.read(source)
    points = np.ascontiguousarray(mesh.points, dtype=np.float64)
    tets = mesh.cells_dict['tetra'].astype(np.int32)
    volumes = np.linalg.det(points[tets[:, 1:]] - points[tets[:, :1]]) / 6
    if volumes.min() <= 0:
        raise ValueError('Invalid input mesh.')
    center = np.array([74.5402, -1.2438, -50.4298])
    zmin, zmax = points[:, 2].min(), points[:, 2].max()
    fixed = points[:, 2] < zmin + 15
    loaded = (points[:, 2] > zmax - 8) & (np.linalg.norm(points - center, axis=1) < 25)
    centroids = points[tets].mean(axis=1)
    eligible = (centroids[:, 2] > zmin + 30) & (np.linalg.norm(centroids - center, axis=1) > 30)
    averaging = strain_averaging_matrix(centroids, volumes)
    def averaged_ratio(strain):
        averaged = (averaging @ strain.reshape(-1, 9)).reshape(-1, 3, 3)
        return failure_ratio(averaged)
    solver = PressSolver(points, tets, fixed, loaded)
    reference = solver.solve(1.0)
    onset_stroke = 1 / averaged_ratio(reference['strain'])[eligible].max()
    print(f'Elastic reference: {reference["load_n"]:.3f} N/mm; first strain-limit stroke {onset_stroke:.3f} mm', flush=True)
    output.mkdir(parents=True, exist_ok=True)
    damage = np.zeros(len(tets))
    history = np.zeros(len(tets))
    frames = []
    trial = None
    trial_iterations = 0
    if checkpoint and checkpoint.exists():
        saved = np.load(checkpoint, allow_pickle=False)
        if 'signature' not in saved or str(saved['signature']) != signature:
            raise ValueError('Checkpoint does not match this source mesh and solver. Use a new checkpoint path.')
        damage = saved['damage'].copy()
        history = saved['history'].copy()
        frames = json.loads(str(saved['frames']))
        if not all((output / frame['file']).exists() for frame in frames):
            raise ValueError('Checkpoint frames are missing from the output folder.')
        if 'trial_damage' in saved:
            trial = saved['trial_damage'].copy()
            trial_iterations = int(saved['trial_iterations'])
        print('Resuming after', len(frames), 'converged frames', flush=True)
    ratios = [0, .15, .3, .45, .6, .75, .9, 1, 1.05, 1.1, 1.2, 1.35, 1.5, 1.75, 2.0]
    for index, ratio in enumerate(ratios):
        if index < len(frames):
            continue
        stroke = onset_stroke * ratio
        committed_damage = damage.copy()
        iteration_offset = trial_iterations if trial is not None else 0
        if trial is not None:
            damage, trial = trial, None
        for iteration in range(max_iterations):
            result = solver.solve(stroke, damage)
            kappa = np.maximum(history, averaged_ratio(result['strain']))
            candidate = np.maximum(committed_damage, damage_law(kappa))
            candidate[~eligible] = 0
            error = float(np.max(np.abs(candidate - damage)))
            if error < .002:
                break
            # Trial iterates may decrease, but never below the previous
            # converged step. Locking trial overshoots would prevent equilibrium.
            damage = np.maximum(committed_damage, .5 * damage + .5 * candidate)
            if iteration % 5 == 0:
                print(f'Step {index}: iteration {iteration}, damage residual {error:.4f}, load {result["load_n"]:.2f} N', flush=True)
                if checkpoint:
                    np.savez_compressed(checkpoint, damage=committed_damage, history=history,
                        trial_damage=damage, trial_iterations=iteration_offset + iteration + 1,
                        frames=json.dumps(frames), signature=signature)
        else:
            raise RuntimeError(f'Damage step {index} did not converge (residual {error}). No completed manifest will be written.')
        history = kappa
        file = f'frame-{index:02d}.vtp'
        failure_index = np.where(eligible, history, 0)
        maximum = write_frame(output / file, points, tets, result, damage, volumes, failure_index, eligible)
        frame = {
            'file': file, 'stroke_mm': float(stroke), 'load_n': result['load_n'],
            'max_stress_mpa': float(result['von_mises'].max()), 'max_nodal_stress_mpa': maximum,
            'max_displacement_mm': float(np.linalg.norm(result['displacement'], axis=1).max()),
            'max_damage': float(damage.max()),
            'max_failure_index': float(failure_index.max()),
            'damaged_volume_percent': float(volumes[damage > .05].sum() / volumes.sum() * 100),
            'eroded_volume_percent': float(volumes[damage >= .95].sum() / volumes.sum() * 100),
            'damage_iterations': iteration_offset + iteration + 1, 'damage_residual': error,
            'relative_free_residual': result['relative_free_residual'], 'relative_balance_error': result['relative_balance_error'],
            'head_motion_mm': result['displacement'][loaded].mean(axis=0).tolist(),
        }
        frames.append(frame)
        if checkpoint:
            np.savez_compressed(checkpoint, damage=damage, history=history,
                displacement=result['displacement'], frames=json.dumps(frames), signature=signature)
        print('FRAME', index, json.dumps(frame), flush=True)
    manifest = {
        'title': 'HFValid Pat001 — hydraulic press demonstration', 'dataset': 'HFValid', 'case_id': 'Pat001',
        'anatomy': 'Complete right femur', 'source_url': 'https://amsacta.unibo.it/id/eprint/8431/',
        'solver': 'SfePy', 'nodes': len(points), 'elements': len(tets),
        'source_mesh_sha256': hashlib.sha256(source.read_bytes()).hexdigest(),
        'youngs_modulus_mpa': 10000, 'poisson_ratio': .3,
        'tensile_strain_limit': .0073, 'compressive_strain_limit': .0104,
        'softening_coefficient': 3, 'residual_stiffness_fraction': .005,
        'strain_averaging_radius_mm': 3.0,
        'stress_color_max_mpa': stress_color_scale(output, frames),
        'stress_color_scale_method': 'Fixed across all steps at the largest per-step 99th percentile of visible nodal stress. Higher values saturate red; peak metrics and VTP values are not clipped.',
        'failure_color_scale_method': 'Fixed 0 to 1; red at the assumed principal-strain limit. Each surface face uses its owning element historical ratio, using the same 3 mm averaging and limits as the damage law. Fixture regions excluded from damage are gray. Not a stress in MPa or a fracture-risk probability.',
        'first_limit_stroke_mm': float(onset_stroke),
        'elastic_stiffness_n_per_mm': reference['load_n'],
        'bounds': [float(points[:, i].min()) for i in range(3)] + [float(points[:, i].max()) for i in range(3)],
        'head_center': center.tolist(), 'frames': frames,
        'method': 'Displacement-controlled, small-strain FE compression; fixed distal 15 mm; prescribed -Z displacement of head patch; lateral head motion free; irreversible scalar damage driven by volume-weighted strain averaged within a 3 mm centroid radius; damped staggered equilibrium solve.',
        'damage_law': 'k=max history of max(eps_max/0.0073, -eps_min/0.0104, 0); d=max(0,min(0.995,1-exp(-3*(k-1))/k)) for k>1.',
        'limitations': [
            'Illustrative homogeneous material and uncalibrated, mesh-dependent softening. Not an early-detection or clinical fracture prediction.',
            'No calibrated CT-density material mapping, contact mechanics, fluid hydraulics, large-deformation mechanics or fracture-energy regularization.',
            'Failure is disabled within 30 mm of the distal end and within 30 mm of the head center to avoid fixture-driven local singularities.',
            'Elements with damage >= 0.95 are hidden to expose the damaged region. They retain residual stiffness in the mechanical solve; this is not a discrete crack/contact simulation.',
            'Color contours are volume-weighted nodal averages; peak element stress is reported separately.',
        ],
        'strain_limit_reference': 'https://www.jove.com/t/64947/imaging-of-the-microstructural-failure-mechanism-in-the-human-hip',
        'license': 'CC BY 4.0; source geometry: Aldieri et al. (2025), HFValid, University of Bologna, DOI 10.6092/unibo/amsacta/8431',
    }
    (output / 'manifest.json').write_text(json.dumps(manifest, indent=2), encoding='utf-8')


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--output', type=Path, default=Path(__file__).resolve().parents[2] / 'public/models/femur-press')
    parser.add_argument('--max-iterations', type=int, default=200)
    parser.add_argument('--checkpoint', type=Path, help='Optional local checkpoint outside public/ for resuming this exact model')
    args = parser.parse_args()
    main(args.output, args.max_iterations, args.checkpoint)
