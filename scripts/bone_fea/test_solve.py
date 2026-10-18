"""Physics checks: analytic compression, force balance and linear scaling."""
import unittest
import numpy as np
from solve import tetrahedralize, solve_elasticity, surface_faces


class ElasticityTests(unittest.TestCase):
    def test_compression_matches_analytic_bar(self):
        points, tets = tetrahedralize(np.ones((3, 3, 6), dtype=bool), np.eye(4))
        result = solve_elasticity(points, tets, load_newtons=90, youngs_modulus_mpa=1000, poisson_ratio=0)
        # A=9 mm2, L=6 mm; stress=F/A=10 MPa, delta=FL/EA=0.06 mm.
        np.testing.assert_allclose(result['von_mises'], 10, rtol=1e-8)
        self.assertAlmostEqual(result['metrics']['max_displacement_mm'], .06, places=8)
        np.testing.assert_allclose(result['metrics']['reaction_newtons'], [0, 0, 90], atol=1e-7)
        self.assertLess(result['metrics']['relative_free_residual'], 1e-9)
        np.testing.assert_allclose(result['displacement'][np.isclose(points[:, 2], -.5)], 0, atol=1e-12)
        doubled = solve_elasticity(points, tets, load_newtons=180, youngs_modulus_mpa=1000, poisson_ratio=0)
        np.testing.assert_allclose(doubled['displacement'], result['displacement'] * 2, atol=1e-9)
        np.testing.assert_allclose(doubled['von_mises'], result['von_mises'] * 2, rtol=1e-8)

    def test_disconnected_mask_rejected(self):
        mask = np.zeros((5, 5, 5), dtype=bool)
        mask[:2, :2, :2] = True
        mask[4, 4, 4] = True
        with self.assertRaises(ValueError):
            tetrahedralize(mask, np.eye(4))

    def test_thick_loading_patch_has_correct_resultant(self):
        points, tets = tetrahedralize(np.ones((3, 3, 8), dtype=bool), np.eye(4))
        result = solve_elasticity(points, tets, load_newtons=100,
                                  support_depth_mm=1.5, load_depth_mm=1.5)
        np.testing.assert_allclose(result['metrics']['reaction_newtons'], [0, 0, 100], atol=1e-7)
        fixed = points[:, 2] < points[:, 2].min() + 1.5
        np.testing.assert_allclose(result['displacement'][fixed], 0, atol=1e-12)
        self.assertLess(result['metrics']['relative_free_residual'], 1e-9)

    def test_surface_is_closed_and_tets_positive(self):
        points, tets = tetrahedralize(np.ones((2, 2, 2), dtype=bool), np.diag([-1., -1., -1., 1.]))
        self.assertTrue(np.all(np.linalg.det(points[tets[:, 1:]] - points[tets[:, :1]]) > 0))
        faces, _ = surface_faces(points, tets)
        edges = np.sort(faces[:, [[0, 1], [1, 2], [2, 0]]].reshape(-1, 2), axis=1)
        _, counts = np.unique(edges, axis=0, return_counts=True)
        np.testing.assert_array_equal(counts, 2)


if __name__ == '__main__':
    unittest.main()
