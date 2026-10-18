"""Displacement-controlled compression with illustrative irreversible damage.

Units: mm, N, MPa. A scalar strain-softening law is used for a demonstrator,
not a calibrated fracture prediction. Residual stiffness prevents singularity.
"""
import numpy as np
from scipy.spatial import cKDTree


def strain_averaging_matrix(centroids, volumes, radius_mm=3.0):
    """Volume-weighted nonlocal strain average, to suppress tiny-element peaks."""
    tree = cKDTree(centroids)
    weights = tree.sparse_distance_matrix(tree, radius_mm, output_type='coo_matrix')
    weights.data = volumes[weights.col]
    weights = weights.tocsr()
    return weights.multiply(1 / np.asarray(weights.sum(axis=1))).tocsr()


def strain_tensor(points, tets, displacement):
    edges = points[tets[:, 1:]] - points[tets[:, :1]]
    du = displacement[tets[:, 1:]] - displacement[tets[:, :1]]
    gradient = np.linalg.solve(edges, du)
    return (gradient + gradient.transpose(0, 2, 1)) * 0.5


def failure_ratio(strain, tensile_limit=0.0073, compressive_limit=0.0104):
    principal = np.linalg.eigvalsh(strain)
    return np.maximum(np.maximum(principal[:, -1], 0) / tensile_limit,
                      np.maximum(-principal[:, 0], 0) / compressive_limit)


def damage_law(history, softening=3.0, residual_stiffness=0.005):
    kappa = np.maximum(history, 1.0)
    return np.clip(1 - np.exp(-softening * (kappa - 1)) / kappa,
                   0, 1 - residual_stiffness)


class PressSolver:
    def __init__(self, points, tets, fixed_nodes, loaded_nodes,
                 youngs_modulus=10000.0, poisson_ratio=0.3):
        from sfepy.base.base import IndexedStruct, output
        from sfepy.discrete import FieldVariable, Material, Integral, Equation, Equations, Problem, Function, Functions
        from sfepy.discrete.conditions import Conditions, EssentialBC
        from sfepy.discrete.fem import Mesh, FEDomain, Field
        from sfepy.mechanics.matcoefs import stiffness_from_youngpoisson
        from sfepy.solvers.ls import ScipyDirect, standard_call
        from scipy.sparse.linalg import splu
        from sfepy.solvers.nls import Newton
        from sfepy.terms import Term

        class SymmetricDirect(ScipyDirect):
            @standard_call
            def __call__(self, rhs, x0=None, conf=None, eps_a=None, eps_r=None,
                         i_max=None, mtx=None, status=None, **kwargs):
                # Symmetric stiffness sparsity permits a smaller LU factor than
                # the general COLAMD ordering, important for repeated solves.
                factor = splu(mtx.tocsc(), permc_spec='MMD_AT_PLUS_A',
                    diag_pivot_thresh=0.0, options={'SymmetricMode': True})
                return factor.solve(rhs)

        output.set_output(quiet=True)
        self.points, self.tets = points, tets
        self.fixed_nodes, self.loaded_nodes = fixed_nodes, loaded_nodes
        self.damage = np.zeros(len(tets))
        self.stroke = 0.0
        self.elastic_matrix = stiffness_from_youngpoisson(3, youngs_modulus, poisson_ratio)
        self.youngs_modulus, self.poisson_ratio = youngs_modulus, poisson_ratio
        mesh = Mesh.from_data('press_femur', points, None, [tets], [np.zeros(len(tets), dtype=np.int32)], ['3_4'])
        domain = FEDomain('domain', mesh)
        omega = domain.create_region('Omega', 'all')
        selectors = Functions([
            Function('fixed_nodes', lambda coors, domain=None: np.where(fixed_nodes)[0]),
            Function('loaded_nodes', lambda coors, domain=None: np.where(loaded_nodes)[0]),
        ])
        fixed = domain.create_region('Fixed', 'vertices by fixed_nodes', 'vertex', functions=selectors)
        loaded = domain.create_region('Loaded', 'vertices by loaded_nodes', 'vertex', functions=selectors)
        field = Field.from_args('displacement', np.float64, 'vector', omega, approx_order=1)
        u = FieldVariable('u', 'unknown', field)
        v = FieldVariable('v', 'test', field, primary_var_name='u')

        def material(ts, coors, mode=None, **kwargs):
            if mode != 'qp':
                return None
            # One quadrature point per linear tetrahedron (constant strain).
            if len(coors) != len(tets):
                raise ValueError('Unexpected quadrature order or element mapping.')
            return {'D': (1 - self.damage)[:, None, None] * self.elastic_matrix[None, :, :]}

        self.solid = Material('solid', function=material)
        term = Term.new('dw_lin_elastic(solid.D, v, u)', Integral('i', order=1), omega, solid=self.solid, v=v, u=u)
        self.problem = Problem('press', equations=Equations([Equation('balance', term)]))
        self.conditions = Conditions([
            EssentialBC('distal_clamp', fixed, {'u.all': 0.0}),
            EssentialBC('head_stroke', loaded, {'u.2': Function('stroke', lambda ts, coors, **kwargs: np.full(len(coors), -self.stroke))}),
        ])
        self.problem.set_bcs(ebcs=self.conditions)
        self.problem.set_solver(Newton({'i_max': 1, 'eps_a': 1e-6, 'eps_r': 1e-9},
            lin_solver=SymmetricDirect({}), status=IndexedStruct()))

    def solve(self, stroke, damage=None):
        from sfepy.mechanics.tensors import get_von_mises_stress
        self.stroke = float(stroke)
        if damage is not None:
            self.damage = np.asarray(damage).copy()
        self.problem.set_bcs(ebcs=self.conditions)
        self.solid.reset()
        state = self.problem.solve(save_results=False)
        full_state = state().copy()
        displacement = full_state.reshape(-1, 3)
        strain = strain_tensor(self.points, self.tets, displacement)
        # Recover full stress with tensor shear strains (not engineering shear).
        mu = self.youngs_modulus / (2 * (1 + self.poisson_ratio))
        lam = self.youngs_modulus * self.poisson_ratio / ((1 + self.poisson_ratio) * (1 - 2 * self.poisson_ratio))
        stress_tensor = (1 - self.damage)[:, None, None] * (2 * mu * strain + lam * np.trace(strain, axis1=1, axis2=2)[:, None, None] * np.eye(3))
        stress = stress_tensor[:, [0, 1, 2, 0, 0, 1], [0, 1, 2, 1, 2, 2]]
        vm = get_von_mises_stress(stress).ravel()
        self.problem.remove_bcs()
        residual = self.problem.equations.eval_residuals(full_state).reshape(-1, 3)
        free = np.ones_like(residual, dtype=bool)
        free[self.fixed_nodes] = False
        free[self.loaded_nodes, 2] = False
        reaction = residual[self.fixed_nodes].sum(axis=0)
        load = -float(residual[self.loaded_nodes, 2].sum())
        scale = max(abs(load), 1.0)
        equilibrium = float(np.linalg.norm(residual[free]) / scale)
        balance = float(np.linalg.norm(reaction - [0, 0, load]) / scale)
        if not np.isfinite(displacement).all() or load < -1e-6 or max(equilibrium, balance) > 1e-6:
            raise RuntimeError(f'Invalid equilibrium: load={load}, free={equilibrium}, balance={balance}')
        return {'displacement': displacement, 'strain': strain, 'von_mises': vm,
                'load_n': load, 'relative_free_residual': equilibrium, 'relative_balance_error': balance}
