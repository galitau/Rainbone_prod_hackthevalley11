"""Export the full-resolution Slicer surface as a millimeter-scale binary STL.

Run with Python + VTK + NumPy, or Slicer's bin/PythonSlicer executable.
This exports the intact anatomy, independently of FEA frames and display scale.
"""
import argparse
import hashlib
import json
from pathlib import Path

import numpy as np
import vtk
from vtk.util.numpy_support import numpy_to_vtk, vtk_to_numpy


def inspect_surface(surface):
    points = vtk_to_numpy(surface.GetPoints().GetData()).astype(np.float64)
    cells = vtk_to_numpy(surface.GetPolys().GetData())
    if not len(cells) or len(cells) % 4 or not np.all(cells[::4] == 3):
        raise ValueError('The print surface must contain only triangles.')
    faces = cells.reshape(-1, 4)[:, 1:]
    if not np.isfinite(points).all():
        raise ValueError('The print surface contains invalid coordinates.')
    a, b, c = points[faces[:, 0]], points[faces[:, 1]], points[faces[:, 2]]
    if np.any(np.linalg.norm(np.cross(b - a, c - a), axis=1) <= 1e-10):
        raise ValueError('The print surface contains zero-area triangles.')
    edges = np.concatenate((faces[:, [0, 1]], faces[:, [1, 2]], faces[:, [2, 0]]))
    _, inverse, counts = np.unique(np.sort(edges, axis=1), axis=0, return_inverse=True, return_counts=True)
    if not np.all(counts == 2):
        raise ValueError('The print surface has open or nonmanifold edges.')
    directions = np.where(edges[:, 0] < edges[:, 1], 1, -1)
    if np.any(np.bincount(inverse, weights=directions) != 0):
        raise ValueError('The print surface has inconsistent face winding.')
    connected = vtk.vtkPolyDataConnectivityFilter()
    connected.SetInputData(surface)
    connected.SetExtractionModeToAllRegions()
    connected.Update()
    if connected.GetNumberOfExtractedRegions() != 1:
        raise ValueError('The intact bone must be one connected surface.')
    signed_volume = np.einsum('ij,ij->i', a, np.cross(b, c)).sum() / 6
    if signed_volume <= 0:
        raise ValueError('The print surface must enclose positive volume.')
    return {
        'triangles': len(faces),
        'dimensions_mm': np.ptp(points, axis=0).tolist(),
        'volume_mm3': float(signed_volume),
        'connected_components': 1,
        'boundary_edges': 0,
        'nonmanifold_edges': 0,
    }


def export_print_mesh(directory):
    source = directory / 'slicer-surface.vtp'
    provenance = json.loads((directory / 'provenance.json').read_text(encoding='utf-8'))
    reader = vtk.vtkXMLPolyDataReader()
    reader.SetFileName(str(source))
    reader.Update()
    if not reader.GetOutput().GetNumberOfPoints():
        raise ValueError('The Slicer surface is empty or could not be read.')
    triangles = vtk.vtkTriangleFilter()
    triangles.SetInputConnection(reader.GetOutputPort())
    triangles.PassLinesOff()
    triangles.PassVertsOff()
    clean = vtk.vtkCleanPolyData()
    clean.SetInputConnection(triangles.GetOutputPort())
    clean.SetTolerance(0)
    normals = vtk.vtkPolyDataNormals()
    normals.SetInputConnection(clean.GetOutputPort())
    normals.SplittingOff()
    normals.ConsistencyOn()
    normals.AutoOrientNormalsOn()
    normals.Update()
    surface = vtk.vtkPolyData()
    surface.DeepCopy(normals.GetOutput())
    before = inspect_surface(surface)
    # Translation only: retain anatomical size and orientation, center XY,
    # and place the lowest point at Z=0 for import onto a slicer's build plate.
    points = vtk_to_numpy(surface.GetPoints().GetData()).astype(np.float64)
    lower, upper = points.min(axis=0), points.max(axis=0)
    offset = np.array([(lower[0] + upper[0]) / 2, (lower[1] + upper[1]) / 2, lower[2]])
    surface.GetPoints().SetData(numpy_to_vtk(points - offset, deep=True))
    output = directory / 'bone-print.stl'
    writer = vtk.vtkSTLWriter()
    writer.SetInputData(surface)
    writer.SetFileName(str(output))
    writer.SetFileTypeToBinary()
    writer.SetHeader(f"HFValid {provenance['case_id']} right femur; mm; CC BY 4.0; intact")
    if not writer.Write():
        raise RuntimeError('Could not write the print STL.')
    roundtrip = vtk.vtkSTLReader()
    roundtrip.SetFileName(str(output))
    roundtrip.Update()
    report = inspect_surface(roundtrip.GetOutput())
    if report['triangles'] != before['triangles'] or not np.allclose(
        report['dimensions_mm'], before['dimensions_mm'], atol=1e-4, rtol=0
    ) or not np.isclose(report['volume_mm3'], before['volume_mm3'], rtol=1e-5):
        raise ValueError('STL round-trip changed the surface geometry.')
    if output.stat().st_size != 84 + 50 * report['triangles']:
        raise ValueError('The binary STL has an unexpected length.')
    report.update({
        'file': output.name,
        'download_name': f"HFValid-{provenance['case_id']}-right-femur-mm.stl",
        'units': 'mm',
        'scale': 1,
        'state': 'Intact, undeformed bone',
        'source': source.name,
        'source_sha256': hashlib.sha256(source.read_bytes()).hexdigest(),
        'sha256': hashlib.sha256(output.read_bytes()).hexdigest(),
        'bytes': output.stat().st_size,
        'translation_mm': (-offset).tolist(),
        'source_url': provenance['source_url'],
        'license': provenance['license'],
        'attribution': provenance['attribution'],
    })
    (directory / 'bone-print.json').write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(report, indent=2))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--model-dir', type=Path, default=Path(__file__).resolve().parents[2] / 'frontend/public/models/hfvalid-femur')
    export_print_mesh(parser.parse_args().model_dir)
