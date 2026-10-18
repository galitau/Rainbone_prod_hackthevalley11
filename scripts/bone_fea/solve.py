"""Linear-elastic SfePy solve for the dashboard's reference model.

Units: millimetres, newtons, MPa. backend/services/fea_solver.py also uses
this module for POST /api/simulate.
"""
from __future__ import annotations

import numpy as np
from scipy import ndimage
import importlib.util
from pathlib import Path

# The API loads this script by path, so its optional helper is loaded the same way.
try:
    _native_spec = importlib.util.spec_from_file_location("rainbone_native_surface", Path(__file__).with_name("native_surface.py"))
    _native_surface = importlib.util.module_from_spec(_native_spec)
    _native_spec.loader.exec_module(_native_surface)
except (ImportError, OSError, AttributeError, RuntimeError):
    _native_surface = None


def tetrahedralize(mask: np.ndarray, affine: np.ndarray):
    """Split each occupied voxel into six conforming, positively oriented tets."""
    labels, count = ndimage.label(mask)
    if count != 1 or mask.sum() < 8:
        raise ValueError("Supply one face-connected bone segment with at least eight voxels.")
    cells = np.argwhere(mask)
    corners = np.array([[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0],
                        [0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]])
    grid, inverse = np.unique((cells[:, None, :] + corners).reshape(-1, 3), axis=0, return_inverse=True)
    cubes = inverse.reshape(-1, 8)
    split = np.array([[0, 1, 2, 6], [0, 2, 3, 6], [0, 3, 7, 6],
                      [0, 7, 4, 6], [0, 4, 5, 6], [0, 5, 1, 6]])
    tets = cubes[:, split].reshape(-1, 4).astype(np.int32)
    points = (grid - 0.5) @ affine[:3, :3].T + affine[:3, 3]
    points = np.ascontiguousarray(points, dtype=np.float64)
    determinants = np.linalg.det(points[tets[:, 1:]] - points[tets[:, :1]])
    flipped = determinants < 0
    tets[flipped] = tets[flipped][:, [0, 2, 1, 3]]
    if np.any(np.abs(determinants) < 1e-10):
        raise ValueError("Degenerate tetrahedra.")
    return points, tets


def surface_faces(points, tets):
    faces, owners, _ = _surface_faces(points, tets)
    return faces, owners


def _surface_faces(points, tets):
    selected = _native_surface.boundary_face_indices(tets) if _native_surface is not None else None
    if selected is not None:
        pattern = np.array([[1, 2, 3], [0, 3, 2], [0, 1, 3], [0, 2, 1]])
        owners = selected // 4
        faces = tets[owners[:, None], pattern[selected % 4]]
        return faces, owners, "cpp"
    faces = tets[:, [[1, 2, 3], [0, 3, 2], [0, 1, 3], [0, 2, 1]]].reshape(-1, 3)
    _, first, counts = np.unique(np.sort(faces, axis=1), axis=0, return_index=True, return_counts=True)
    selected = first[counts == 1]
    return faces[selected], selected // 4, "numpy"


def solve_elasticity(points, tets, load_newtons=800.0, youngs_modulus_mpa=10000.0,
                     poisson_ratio=0.3, support_depth_mm=1e-6,
                     load_depth_mm=1e-6, head_center=None,
                     element_youngs_modulus_mpa=None, save_results=True):
    """Assemble and solve 3D P1 tetrahedral elasticity with SfePy.

    Clamp a distal Z band and apply uniform -Z traction to a proximal surface
    band (optionally limited to the femoral head). The default infinitesimal
    bands select the flat faces used in the analytical verification test.
    Optional element_youngs_modulus_mpa gives one isotropic modulus per
    tetrahedron; it replaces youngs_modulus_mpa, and the metrics then report
    the volume-weighted mean modulus. save_results=False stops SfePy from
    writing domain.vtk to the working directory.
    """
    from sfepy.base.base import IndexedStruct
    from sfepy.discrete import FieldVariable, Material, Integral, Equation, Equations, Problem, Function, Functions
    from sfepy.discrete.conditions import Conditions, EssentialBC
    from sfepy.discrete.fem import Mesh, FEDomain, Field
    from sfepy.mechanics.matcoefs import stiffness_from_youngpoisson
    from sfepy.mechanics.tensors import get_von_mises_stress
    from sfepy.solvers.ls import ScipyDirect
    from sfepy.solvers.nls import Newton
    from sfepy.terms import Term

    if load_newtons <= 0 or youngs_modulus_mpa <= 0 or not 0 <= poisson_ratio < 0.5:
        raise ValueError("Invalid elastic material or load.")
    if element_youngs_modulus_mpa is not None:
        element_youngs_modulus_mpa = np.asarray(element_youngs_modulus_mpa, dtype=np.float64)
        if (element_youngs_modulus_mpa.shape != (len(tets),)
                or not np.all(np.isfinite(element_youngs_modulus_mpa) & (element_youngs_modulus_mpa > 0))):
            raise ValueError("Supply one finite, positive Young's modulus per tetrahedron.")
    faces, owners, surface_backend = _surface_faces(points, tets)
    zmin, zmax = points[:, 2].min(), points[:, 2].max()
    def fixed_vertices(coordinates, domain=None):
        return np.where(coordinates[:, 2] < zmin + support_depth_mm)[0]

    def loaded_vertices(coordinates, domain=None):
        selected = coordinates[:, 2] > zmax - load_depth_mm
        if head_center is not None:
            selected &= np.linalg.norm(coordinates - np.asarray(head_center), axis=1) < 25.0
        return np.where(selected)[0]

    fixed_nodes = np.zeros(len(points), dtype=bool)
    fixed_nodes[fixed_vertices(points)] = True
    loaded_nodes = np.zeros(len(points), dtype=bool)
    loaded_nodes[loaded_vertices(points)] = True
    top = np.all(loaded_nodes[faces], axis=1)
    bottom = np.all(fixed_nodes[faces], axis=1)
    triangles = points[faces[top]]
    area = np.linalg.norm(np.cross(triangles[:, 1] - triangles[:, 0], triangles[:, 2] - triangles[:, 0]), axis=1).sum() / 2
    if area <= 0 or not bottom.any():
        raise ValueError("The mesh must have nonempty loading and support patches.")
    mesh = Mesh.from_data('bone', points, None, [tets], [np.zeros(len(tets), dtype=np.int32)], ['3_4'])
    domain = FEDomain('domain', mesh)
    omega = domain.create_region('Omega', 'all')
    selectors = Functions([Function('fixed_vertices', fixed_vertices), Function('loaded_vertices', loaded_vertices)])
    fixed = domain.create_region('Fixed', 'vertices by fixed_vertices', 'vertex', functions=selectors)
    domain.create_region('LoadedBand', 'vertices by loaded_vertices', 'facet', functions=selectors)
    domain.create_region('Surface', 'vertices of surface', 'facet')
    # Intersect with the exterior to exclude internal faces within a thick band.
    loaded = domain.create_region('Loaded', 'r.LoadedBand *f r.Surface', 'facet')
    field = Field.from_args('displacement', np.float64, 'vector', omega, approx_order=1)
    u = FieldVariable('u', 'unknown', field)
    v = FieldVariable('v', 'test', field, primary_var_name='u')
    if element_youngs_modulus_mpa is None:
        solid = Material('solid', D=stiffness_from_youngpoisson(3, youngs_modulus_mpa, poisson_ratio))
    else:
        def element_stiffness(ts, coors, mode=None, term=None, **kwargs):
            # SfePy expects one stiffness per quadrature point, cell-major.
            if mode != 'qp':
                return None
            cells = term.region.cells
            stiffness = stiffness_from_youngpoisson(3, element_youngs_modulus_mpa[cells], poisson_ratio)
            return {'D': np.repeat(stiffness, len(coors) // len(cells), axis=0)}
        solid = Material('solid', function=Function('element_stiffness', element_stiffness))
    traction = Material('traction', val=np.array([[0.0], [0.0], [-load_newtons / area]]))
    integral = Integral('i', order=2)
    elastic = Term.new('dw_lin_elastic(solid.D, v, u)', integral, omega, solid=solid, v=v, u=u)
    force = Term.new('dw_surface_ltr(traction.val, v)', integral, loaded, traction=traction, v=v)
    problem = Problem('bone_compression', equations=Equations([Equation('balance', elastic - force)]))
    problem.set_bcs(ebcs=Conditions([EssentialBC('clamp', fixed, {'u.all': 0.0})]))
    status = IndexedStruct()
    problem.set_solver(Newton({'i_max': 1, 'eps_a': 1e-7, 'eps_r': 1e-10}, lin_solver=ScipyDirect({}), status=status))
    state = problem.solve(save_results=save_results)
    displacement = state().copy().reshape(-1, 3)
    stress = problem.evaluate('ev_cauchy_stress.2.Omega(solid.D, u)', mode='el_avg', solid=solid, u=u).reshape(-1, 6)
    vm = get_von_mises_stress(stress).ravel()
    # Remove constraints only after saving the solution: the full residual at
    # constrained nodes gives reactions; at free nodes it gives equilibrium error.
    full_state = state().copy()
    problem.remove_bcs()
    residual = problem.equations.eval_residuals(full_state).reshape(-1, 3)
    constrained = fixed_nodes
    reaction = residual[constrained].sum(axis=0)
    relative_residual = float(np.linalg.norm(residual[~constrained]) / load_newtons)
    balance_error = float(np.linalg.norm(reaction - [0, 0, load_newtons]) / load_newtons)
    if not np.isfinite(displacement).all() or not np.isfinite(vm).all() or max(relative_residual, balance_error) > 1e-6:
        raise RuntimeError(f'FEA failed equilibrium checks: residual={relative_residual}, balance={balance_error}')
    volumes = np.abs(np.linalg.det(points[tets[:, 1:]] - points[tets[:, :1]])) / 6
    result = {
        'displacement': displacement, 'stress': stress, 'von_mises': vm,
        'faces': faces, 'owners': owners, 'top_faces': top, 'bottom_faces': bottom,
        'metrics': {
            'solver': 'SfePy', 'element_type': '4-node linear tetrahedron',
            'surface_extraction_backend': surface_backend,
            'surface_cpp_standard': _native_surface.cpp_standard() if surface_backend == 'cpp' else None,
            'nodes': len(points), 'elements': len(tets),
            'load_newtons': load_newtons, 'youngs_modulus_mpa': youngs_modulus_mpa,
            'poisson_ratio': poisson_ratio, 'loaded_area_mm2': float(area),
            'support_depth_mm': support_depth_mm, 'load_depth_mm': load_depth_mm,
            'fixed_nodes': int(fixed_nodes.sum()), 'loaded_surface_triangles': int(top.sum()),
            'volume_cm3': float(volumes.sum() / 1000),
            'min_element_volume_mm3': float(volumes.min()),
            'max_element_volume_mm3': float(volumes.max()),
            'max_von_mises_mpa': float(vm.max()),
            'max_displacement_mm': float(np.linalg.norm(displacement, axis=1).max()),
            'reaction_newtons': reaction.tolist(),
            'relative_free_residual': relative_residual,
            'relative_force_balance_error': balance_error,
        },
    }
    if element_youngs_modulus_mpa is not None:
        result['metrics'].update({
            'youngs_modulus_mpa': float(np.average(element_youngs_modulus_mpa, weights=volumes)),
            'min_youngs_modulus_mpa': float(element_youngs_modulus_mpa.min()),
            'max_youngs_modulus_mpa': float(element_youngs_modulus_mpa.max()),
        })
    return result
