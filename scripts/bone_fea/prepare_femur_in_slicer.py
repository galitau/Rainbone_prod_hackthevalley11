"""Create a closed, detailed TetGen surface from the Slicer femur export."""
import json
import os
from pathlib import Path
import traceback

import numpy as np
import slicer
import vtk
from vtk.util.numpy_support import vtk_to_numpy


def main():
    output = Path(os.environ['RAINBOWBONE_OUTPUT'])
    reader = vtk.vtkXMLPolyDataReader()
    reader.SetFileName(str(output / 'slicer-surface.vtp'))
    reader.Update()
    decimate = vtk.vtkDecimatePro()
    decimate.SetInputConnection(reader.GetOutputPort())
    decimate.SetTargetReduction(0.80)
    decimate.PreserveTopologyOn()
    decimate.SplittingOff()
    decimate.BoundaryVertexDeletionOff()
    decimate.Update()
    clean = vtk.vtkCleanPolyData()
    clean.SetInputConnection(decimate.GetOutputPort())
    clean.Update()
    surface = clean.GetOutput()
    edges = vtk.vtkFeatureEdges()
    edges.SetInputData(surface)
    edges.BoundaryEdgesOn()
    edges.NonManifoldEdgesOn()
    edges.FeatureEdgesOff()
    edges.ManifoldEdgesOff()
    edges.Update()
    if edges.GetOutput().GetNumberOfCells():
        raise RuntimeError('The femur surface has open or nonmanifold edges.')
    points = vtk_to_numpy(surface.GetPoints().GetData()).astype(float)
    faces = vtk_to_numpy(surface.GetPolys().GetData()).reshape(-1, 4)[:, 1:]
    with (output / 'bone-surface.poly').open('w') as stream:
        stream.write(f'{len(points)} 3 0 0\n')
        for index, point in enumerate(points):
            stream.write(f'{index} {point[0]:.12g} {point[1]:.12g} {point[2]:.12g}\n')
        stream.write(f'{len(faces)} 0\n')
        for face in faces:
            stream.write(f'1 0\n3 {face[0]} {face[1]} {face[2]}\n')
        stream.write('0\n0\n')
    (output / 'surface-preparation.json').write_text(json.dumps({
        'surface_points': len(points), 'surface_triangles': len(faces),
        'method': 'Slicer closed surface; vtkDecimatePro 80% triangle reduction with topology preservation. Complete femur; no cut planes.',
    }, indent=2))
    print('SURFACE_PREPARED', len(points), len(faces), flush=True)


try:
    main()
except Exception:
    traceback.print_exc()
    slicer.util.exit(1)
else:
    slicer.util.exit(0)
