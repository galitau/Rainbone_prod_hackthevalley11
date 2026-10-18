"""Import HFValid Pat001's CT and reviewed femur segmentation in 3D Slicer.

RAINBOWBONE_INPUT: directory containing Pat001.nrrd and Pat001.stl.
RAINBOWBONE_OUTPUT: output model directory. Run with Slicer's --python-script.
"""
import hashlib
import json
import os
from pathlib import Path
import traceback

import slicer
import vtk


def main():
    source = Path(os.environ['RAINBOWBONE_INPUT'])
    output = Path(os.environ['RAINBOWBONE_OUTPUT'])
    output.mkdir(parents=True, exist_ok=True)
    checksums = {
        'Pat001.nrrd': '9a5efcd007500c735c7bda88bcfd4ca1b26b17730982f4b00f628506494d5ec0',
        'Pat001.stl': '809747ed6f5c11436c9808edfe4beca9b2ad3f1c035df88d307c32b99ff4a93f',
    }
    for name, expected in checksums.items():
        if hashlib.sha256((source / name).read_bytes()).hexdigest() != expected:
            raise ValueError(f'Unexpected source checksum: {name}')
    volume = slicer.util.loadVolume(str(source / 'Pat001.nrrd'))
    model = slicer.util.loadModel(str(source / 'Pat001.stl'))
    segmentation = slicer.mrmlScene.AddNewNodeByClass('vtkMRMLSegmentationNode', 'HFValid Pat001 right femur')
    segmentation.CreateDefaultDisplayNodes()
    segmentation.SetReferenceImageGeometryParameterFromVolumeNode(volume)
    if not slicer.modules.segmentations.logic().ImportModelToSegmentationNode(model, segmentation):
        raise RuntimeError('Could not import the reviewed femur segmentation.')
    segment_id = segmentation.GetSegmentation().GetNthSegmentID(0)
    segment = segmentation.GetSegmentation().GetSegment(segment_id)
    segment.SetName('Right femur')
    segment.SetColor(0.88, 0.86, 0.8)
    segmentation.CreateBinaryLabelmapRepresentation()
    if not slicer.util.saveNode(segmentation, str(output / 'bone.seg.nrrd')):
        raise RuntimeError('Could not save the Slicer segmentation.')
    surface = vtk.vtkPolyData()
    segmentation.GetClosedSurfaceRepresentation(segment_id, surface)
    writer = vtk.vtkXMLPolyDataWriter()
    writer.SetFileName(str(output / 'slicer-surface.vtp'))
    writer.SetInputData(surface)
    if not writer.Write():
        raise RuntimeError('Could not export the Slicer surface.')
    provenance = {
        'dataset': 'HFValid', 'case_id': 'Pat001', 'anatomy': 'Complete right femur',
        'source_url': 'https://amsacta.unibo.it/id/eprint/8431/',
        'download_url': 'https://amsacta.unibo.it/id/eprint/8431/31/HFValid_Collection_v3.zip',
        'source_sha256': checksums, 'license': 'CC BY 4.0',
        'attribution': 'Aldieri, La Mattina, Szyszko, Baruffaldi, Viceconti (2025). HFValid collection. University of Bologna. DOI:10.6092/unibo/amsacta/8431',
        'source_spacing_mm': list(volume.GetSpacing()),
        'source_shape_ijk': list(volume.GetImageData().GetDimensions()),
        'slicer_version': slicer.app.applicationVersion,
        'source_surface_points': surface.GetNumberOfPoints(),
        'source_surface_triangles': surface.GetNumberOfCells(),
        'surface_bounds_ras_mm': list(surface.GetBounds()),
        'head_center_ras_mm': [74.5402, -1.2438, -50.4298],
        'segmentation': 'Dataset author CT segmentation reviewed and corrected in Slicer 4.11; imported with its full CT into Slicer 5.12.4, saved as a segmentation and exported as a closed surface. No synthetic anatomy.',
        'limitations': [
            'Original DICOM-derived CT is distributed by the authors as an NRRD volume.',
            'This demonstration uses homogeneous material, not CT density-calibrated properties.',
            'Distal fixation and head compression are illustrative boundary conditions, not a full musculoskeletal loading model.',
            'This independently computed FEA does not reproduce the dataset authors\' fracture-risk analyses.',
            'No mesh-convergence study or clinical validation is claimed.'
        ],
    }
    (output / 'provenance.json').write_text(json.dumps(provenance, indent=2), encoding='utf-8')
    print('SLICER_FEMUR_EXPORTED', surface.GetNumberOfPoints(), surface.GetNumberOfCells(), surface.GetBounds(), flush=True)


try:
    main()
except Exception:
    traceback.print_exc()
    slicer.util.exit(1)
else:
    slicer.util.exit(0)
