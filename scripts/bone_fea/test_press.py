import unittest
import base64
from pathlib import Path
from tempfile import TemporaryDirectory
import xml.etree.ElementTree as ET
import numpy as np
from press_solver import PressSolver, strain_tensor, failure_ratio, damage_law, strain_averaging_matrix
from solve import tetrahedralize
from build_press import write_frame


class PressTests(unittest.TestCase):
    def test_prescribed_compression_and_damage_reduce_reaction(self):
        points, tets = tetrahedralize(np.ones((3, 3, 6), dtype=bool), np.eye(4))
        fixed = np.isclose(points[:, 2], points[:, 2].min())
        loaded = np.isclose(points[:, 2], points[:, 2].max())
        solver = PressSolver(points, tets, fixed, loaded, youngs_modulus=1000, poisson_ratio=0)
        result = solver.solve(.06)
        self.assertAlmostEqual(result['load_n'], 90, places=6)
        np.testing.assert_allclose(result['von_mises'], 10, rtol=1e-8)
        np.testing.assert_allclose(result['strain'][:, 2, 2], -.01, atol=1e-10)
        weakened = solver.solve(.06, np.full(len(tets), .5))
        self.assertAlmostEqual(weakened['load_n'], 45, places=6)
        np.testing.assert_allclose(weakened['displacement'], result['displacement'], atol=1e-9)

    def test_strain_and_failure_thresholds(self):
        points, tets = tetrahedralize(np.ones((2, 2, 2), dtype=bool), np.eye(4))
        rotation = np.array([[0, -.01, 0], [.01, 0, 0], [0, 0, 0]])
        strain = strain_tensor(points, tets, points @ rotation.T)
        np.testing.assert_allclose(strain, 0, atol=1e-12)
        self.assertAlmostEqual(failure_ratio(np.array([np.diag([.0073, 0, 0])]))[0], 1)
        self.assertAlmostEqual(failure_ratio(np.array([np.diag([0, 0, -.0104])]))[0], 1)
        damage = damage_law(np.array([0., .9, 1, 1.5, 3, 100]))
        self.assertTrue(np.all(np.diff(damage) >= 0))
        np.testing.assert_array_equal(damage[:3], 0)
        self.assertLessEqual(damage.max(), .995)

    def test_nonlocal_average_preserves_uniform_strain(self):
        weights = strain_averaging_matrix(np.array([[0., 0, 0], [1., 0, 0], [9., 0, 0]]), np.array([1., 3., 2.]))
        np.testing.assert_allclose(weights @ np.ones(3), 1)
        np.testing.assert_allclose(weights @ np.array([1., 3., 7.]), [2.5, 2.5, 7.])

    def test_failure_colors_preserve_the_criterion_not_stress(self):
        points = np.array([[0., 0, 0], [1., 0, 0], [0., 1, 0], [0., 0, 1], [0., 0, -1]])
        tets = np.array([[0, 1, 2, 3], [0, 2, 1, 4]])
        # One eligible element has reached its limit; a fixture element has
        # high stress but is excluded from failure. The fields must differ.
        result = {'displacement': np.zeros_like(points), 'von_mises': np.array([10., 200.])}
        with TemporaryDirectory() as folder:
            path = Path(folder) / 'test.vtp'
            write_frame(path, points, tets, result, np.array([.1, 0]), np.ones(2), np.array([1.05, 0]), np.array([True, False]))
            root = ET.parse(path)
            def values(name):
                node = root.find(f".//PointData/DataArray[@Name='{name}']")
                return np.frombuffer(base64.b64decode(node.text)[4:], dtype='<f4')
            np.testing.assert_allclose(values('failure_index'), [1.05, 1.05, 1.05, 1.05, 0])
            np.testing.assert_allclose(values('stress_mpa'), [105, 105, 105, 10, 200])
            def cell_values(name, dtype='<f4'):
                node = root.find(f".//CellData/DataArray[@Name='{name}']")
                return np.frombuffer(base64.b64decode(node.text)[4:], dtype=dtype)
            owners = cell_values('element_id', '<i4')
            # Unlike shared nodal values, face colors must not spread the
            # failed element's red region onto an excluded fixture element.
            np.testing.assert_allclose(cell_values('element_failure_index'), np.array([1.05, 0])[owners])
            np.testing.assert_array_equal(cell_values('element_failure_eligible', '<i4'), np.array([1, 0])[owners])


if __name__ == '__main__':
    unittest.main()
