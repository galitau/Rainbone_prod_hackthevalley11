"""Generate static VTK assets from the Slicer segmentation using real FEA."""
import argparse
import hashlib
import json
from pathlib import Path
import xml.etree.ElementTree as ET

import meshio
import numpy as np

from solve import solve_elasticity


def array(parent, name, values, components=1, dtype='Float64'):
    node = ET.SubElement(parent, 'DataArray', type=dtype, Name=name, NumberOfComponents=str(components), format='ascii')
    node.text = ' '.join(str(v) if dtype == 'Int32' else f'{v:.9g}' for v in np.asarray(values).ravel())


def main(output, mesh_path):
    mesh = meshio.read(mesh_path)
    tets = mesh.cells_dict['tetra'].astype(np.int32)
    used, inverse = np.unique(tets, return_inverse=True)
    points = np.ascontiguousarray(mesh.points[used], dtype=np.float64)
    tets = inverse.reshape(-1, 4).astype(np.int32)
    determinant = np.linalg.det(points[tets[:, 1:]] - points[tets[:, :1]])
    if np.any(np.abs(determinant) < 1e-12):
        raise ValueError('TetGen produced a degenerate element.')
    flip = determinant < 0
    tets[flip] = tets[flip][:, [0, 2, 1, 3]]
    provenance = json.loads((output / 'provenance.json').read_text(encoding='utf-8'))
    result = solve_elasticity(points, tets, support_depth_mm=15.0,
                              load_depth_mm=8.0, head_center=provenance['head_center_ras_mm'])
    metrics = result['metrics']
    faces, owners = result['faces'], result['owners']
    surface_nodes, inverse = np.unique(faces, return_inverse=True)
    surface_faces = inverse.reshape(-1, 3)
    # Standard postprocessing for continuous contours: volume-weighted nodal
    # averages of solved element von Mises values. Keep raw cell values too.
    volumes = np.linalg.det(points[tets[:, 1:]] - points[tets[:, :1]]) / 6
    weights = np.zeros(len(points))
    nodal_vm = np.zeros(len(points))
    for corner in range(4):
        np.add.at(weights, tets[:, corner], volumes)
        np.add.at(nodal_vm, tets[:, corner], volumes * result['von_mises'])
    nodal_vm /= weights
    metrics['max_nodal_von_mises_mpa'] = float(nodal_vm[surface_nodes].max())
    vtk = ET.Element('VTKFile', type='PolyData', version='0.1', byte_order='LittleEndian')
    poly = ET.SubElement(vtk, 'PolyData')
    piece = ET.SubElement(poly, 'Piece', NumberOfPoints=str(len(surface_nodes)), NumberOfPolys=str(len(faces)), NumberOfVerts='0', NumberOfLines='0', NumberOfStrips='0')
    array(ET.SubElement(piece, 'Points'), 'Points', points[surface_nodes], 3)
    polygons = ET.SubElement(piece, 'Polys')
    array(polygons, 'connectivity', surface_faces, dtype='Int32')
    array(polygons, 'offsets', np.arange(1, len(faces) + 1) * 3, dtype='Int32')
    point_data = ET.SubElement(piece, 'PointData', Scalars='displacement_mm', Vectors='displacement', Normals='Normals')
    # Area-weighted normals improve lighting without moving any FE mesh nodes.
    face_points = points[faces]
    face_normals = np.cross(face_points[:, 1] - face_points[:, 0], face_points[:, 2] - face_points[:, 0])
    normals = np.zeros_like(points)
    for corner in range(3):
        np.add.at(normals, faces[:, corner], face_normals)
    normals /= np.maximum(np.linalg.norm(normals, axis=1, keepdims=True), 1e-30)
    array(point_data, 'Normals', normals[surface_nodes], 3)
    array(point_data, 'von_mises_nodal_mpa', nodal_vm[surface_nodes])
    array(point_data, 'displacement', result['displacement'][surface_nodes], 3)
    array(point_data, 'displacement_mm', np.linalg.norm(result['displacement'][surface_nodes], axis=1))
    cell_data = ET.SubElement(piece, 'CellData', Scalars='von_mises_mpa')
    array(cell_data, 'von_mises_mpa', result['von_mises'][owners])
    array(cell_data, 'element_id', owners, dtype='Int32')
    boundary = result['bottom_faces'].astype(int) + result['top_faces'].astype(int) * 2
    array(cell_data, 'boundary', boundary, dtype='Int32')
    ET.ElementTree(vtk).write(output / 'fea-surface.vtp', encoding='utf-8', xml_declaration=True)
    meshio.write_points_cells(output / 'bone-fea.vtu', points, [('tetra', tets)],
        point_data={'displacement_mm': result['displacement'], 'von_mises_nodal_mpa': nodal_vm},
        cell_data={'von_mises_mpa': [result['von_mises']], 'stress_mpa': [result['stress']]})
    import sfepy
    provenance.update({
        'mesh_target_volume_mm3': 80.0,
        'mesh_max_volume_mm3': metrics['max_element_volume_mm3'], 'mesher': 'TetGen 1.6.0',
        'surface_preparation': json.loads((output / 'surface-preparation.json').read_text()),
        'solver_version': sfepy.__version__, 'metrics': metrics,
        'coordinate_system': 'RAS, mm, original CT geometry converted from LPS by Slicer',
        'stress_association': 'Raw element stress retained in VTU and boundary cells; displayed contours use volume-weighted nodal averages of solved element von Mises stress',
        'displacement_association': 'Solved nodal displacements, magnitude in surface VTP, vector in VTU',
        'mesh_processing': 'TetGen boundary-conforming tetrahedra from the Slicer surface; switches -pYq1.4a80z. Boundary triangles preserved.',
        'boundary_conditions': 'Clamp nodes within 15 mm of distal minimum Z; uniform -Z traction totaling 800 N on exterior triangles within 8 mm of maximum Z and within 25 mm of femoral head center',
        'material': 'Homogeneous isotropic linear elasticity, E=10000 MPa, nu=0.3, uncalibrated',
        'files_sha256': {name: hashlib.sha256((output / name).read_bytes()).hexdigest()
                         for name in ['bone.seg.nrrd', 'slicer-surface.vtp', 'fea-surface.vtp', 'bone-fea.vtu']},
    })
    (output / 'manifest.json').write_text(json.dumps(provenance, indent=2), encoding='utf-8')
    print(json.dumps(metrics, indent=2))


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--output', type=Path, default=Path(__file__).resolve().parents[2] / 'public/models/hfvalid-femur')
    parser.add_argument('--mesh', type=Path, required=True, help='TetGen .1.node file with adjacent .1.ele')
    args = parser.parse_args()
    main(args.output, args.mesh)
