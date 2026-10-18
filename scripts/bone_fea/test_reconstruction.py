"""Geometry tests for reconstruction extraction; no FEA solve required."""
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest

import numpy as np
from vtk.util.numpy_support import numpy_to_vtk

from export_reconstruction import TetMesh, boundary_faces, pinches, polydata, write_stl


def saved_surface(mesh, visible):
    faces = boundary_faces(mesh.tets[visible])
    surface = polydata(mesh.points.astype(np.float32), faces)
    ids = np.where(visible)[0]
    owners = np.array([next(index for index in ids if set(face).issubset(mesh.tets[index])) for face in faces])
    array = numpy_to_vtk(owners, deep=True)
    array.SetName('element_id')
    surface.GetCellData().AddArray(array)
    return surface


class ReconstructionTests(unittest.TestCase):
    def setUp(self):
        self.points = np.array([[0., 0, 0], [1., 0, 0], [0., 1, 0], [0., 0, 1], [0., 0, -1]])
        self.mesh = TetMesh(self.points, np.array([[0, 1, 2, 3], [0, 2, 1, 4]]))

    def test_intact_frame_has_nothing_to_print(self):
        removed = self.mesh.recover_removed(saved_surface(self.mesh, np.array([True, True])))
        np.testing.assert_array_equal(removed, [False, False])

    def test_extract_exact_complement_without_display_deformation(self):
        surface = saved_surface(self.mesh, np.array([True, False]))
        exaggerated_displacement = numpy_to_vtk(np.full((surface.GetNumberOfPoints(), 3), 1000.), deep=True)
        exaggerated_displacement.SetName('displacement')
        surface.GetPointData().AddArray(exaggerated_displacement)
        removed = self.mesh.recover_removed(surface)
        np.testing.assert_array_equal(removed, [False, True])
        repaired, iterations = self.mesh.repair(removed)
        np.testing.assert_array_equal(repaired, removed)
        self.assertEqual(iterations, 0)
        self.assertAlmostEqual(self.mesh.volumes[removed].sum(), 1 / 6)

    def test_reject_incomplete_saved_boundary(self):
        faces = boundary_faces(self.mesh.tets[:1])[:-1]
        surface = polydata(self.points.astype(np.float32), faces)
        owners = numpy_to_vtk(np.zeros(len(faces), dtype=np.int32), deep=True)
        owners.SetName('element_id'); surface.GetCellData().AddArray(owners)
        with self.assertRaisesRegex(ValueError, 'entire saved frame boundary'):
            self.mesh.recover_removed(surface)

    def test_reject_wrong_element_owners(self):
        surface = saved_surface(self.mesh, np.array([True, False]))
        surface.GetCellData().GetArray('element_id').Fill(99)
        with self.assertRaisesRegex(ValueError, 'owners'):
            self.mesh.recover_removed(surface)

    def test_edge_touching_pieces_stay_separate_instead_of_being_welded(self):
        points = np.array([[0., 0, -1], [0., 0, 1], [1., 0, 0], [0., 1, 0], [-1., 0, 0], [0., -1, 0]])
        tets = np.array([[0, 1, 2, 3], [0, 1, 3, 4], [0, 1, 4, 5], [0, 1, 5, 2]])
        mesh = TetMesh(points, tets)
        removed = np.array([True, False, True, False])
        self.assertGreater(len(pinches(boundary_faces(tets[removed]))[0]), 0)
        repaired, _ = mesh.repair(removed)
        self.assertTrue(np.all(repaired[removed]))
        self.assertEqual(repaired.sum(), 2)
        for group in (repaired, ~repaired):
            pieces = mesh.components(group)
            self.assertEqual(len(pieces), 2)
            for ids in pieces:
                edges, vertices = pinches(boundary_faces(tets[ids]))
                self.assertEqual(len(edges), 0)
                self.assertEqual(len(vertices), 0)
        self.assertAlmostEqual(mesh.volumes[repaired].sum() + mesh.volumes[~repaired].sum(), mesh.volumes.sum())

    def test_export_matching_stls_keeps_millimeter_scale(self):
        with TemporaryDirectory() as directory:
            volumes = []
            for index in range(2):
                faces = boundary_faces(self.mesh.tets[index:index + 1])
                report = write_stl(Path(directory) / f'part-{index}.stl', self.points + [10, 20, 30], faces, 1 / 6)
                volumes.append(report['volume_mm3'])
                np.testing.assert_allclose(report['dimensions_mm'], [1, 1, 1])
                self.assertEqual(report['triangles'], 4)
                self.assertEqual(report['boundary_edges'], 0)
                self.assertEqual(report['nonmanifold_edges'], 0)
            self.assertAlmostEqual(sum(volumes), 1 / 3)


if __name__ == '__main__':
    unittest.main()
