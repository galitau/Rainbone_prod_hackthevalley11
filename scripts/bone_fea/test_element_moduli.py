"""Checks for the optional per-element Young's modulus in solve_elasticity."""
import unittest
import numpy as np
from solve import tetrahedralize, solve_elasticity


class ElementModulusTests(unittest.TestCase):
    def test_uniform_element_moduli_match_scalar_modulus(self):
        points, tets = tetrahedralize(np.ones((2, 3, 5), dtype=bool), np.eye(4))
        options = dict(load_newtons=50, support_depth_mm=1.5, load_depth_mm=1.5, save_results=False)
        scalar = solve_elasticity(points, tets, youngs_modulus_mpa=2000, **options)
        uniform = solve_elasticity(points, tets, element_youngs_modulus_mpa=np.full(len(tets), 2000.0), **options)
        np.testing.assert_allclose(uniform['displacement'], scalar['displacement'], rtol=1e-10, atol=1e-15)
        np.testing.assert_allclose(uniform['stress'], scalar['stress'], rtol=1e-10, atol=1e-12)
        np.testing.assert_allclose(uniform['von_mises'], scalar['von_mises'], rtol=1e-10, atol=1e-12)
        self.assertEqual(uniform['metrics']['youngs_modulus_mpa'], 2000)

    def test_element_moduli_give_series_bar_compression(self):
        points, tets = tetrahedralize(np.ones((3, 3, 6), dtype=bool), np.eye(4))
        lower = points[tets].mean(axis=1)[:, 2] < 2.5
        moduli = np.where(lower, 1000.0, 3000.0)
        result = solve_elasticity(points, tets, load_newtons=90, poisson_ratio=0,
                                  element_youngs_modulus_mpa=moduli, save_results=False)
        # A=9 mm2, two 3 mm segments: stress=10 MPa, delta=10*3/1000+10*3/3000=0.04 mm.
        np.testing.assert_allclose(result['von_mises'], 10, rtol=1e-8)
        self.assertAlmostEqual(result['metrics']['max_displacement_mm'], .04, places=8)
        # The softer lower segment alone shortens by 0.03 mm.
        np.testing.assert_allclose(result['displacement'][np.isclose(points[:, 2], 2.5), 2], -.03, rtol=1e-8)
        self.assertAlmostEqual(result['metrics']['youngs_modulus_mpa'], 2000, places=8)

    def test_element_moduli_must_match_tetrahedra(self):
        points, tets = tetrahedralize(np.ones((2, 2, 2), dtype=bool), np.eye(4))
        with self.assertRaises(ValueError):
            solve_elasticity(points, tets, element_youngs_modulus_mpa=np.ones(len(tets) - 1))


if __name__ == '__main__':
    unittest.main()
