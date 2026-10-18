# Complete femur with computed FEA

The dashboard viewer loads the static model in `frontend/public/models/hfvalid-femur`.
Only the visualization and its offline asset pipeline are changed. Existing
API endpoints, dashboard metrics, study heading, and history remain demo data.

## Source and 3D Slicer

[HFValid v3, University of Bologna](https://amsacta.unibo.it/id/eprint/8431/)
contains whole-femur CT volumes and reviewed segmentations. This example uses
**Pat001, complete right femur**, not the earlier DeepLesion vertebral section.
The publisher distributes the DICOM-derived CT as NRRD, with its matching STL
segmentation. The scan spacing is 0.703125 x 0.703125 x 2 mm. A different file
extension cannot add spatial resolution or missing anatomy.

The source segmentation was reviewed in 3D Slicer by the dataset authors.
`import_femur_in_slicer.py` loads both the actual CT and reviewed model in
**Slicer 5.12.4**, converts LPS to RAS, saves `bone.seg.nrrd`, and exports the
143,016-triangle closed surface. `prepare_femur_in_slicer.py` preserves topology
while reducing redundant surface triangles for tetrahedralization. No complete
bone is generated or extrapolated from a partial scan.

## Reproduce

Use Python with NumPy, SciPy, meshio and SfePy (tested with SfePy 2026.3).
Conda-forge supplies compiled Windows packages. Install 3D Slicer 5.12.4 and
TetGen 1.6.0 separately. Run these commands from the repository root, replacing
the executable paths with your installations:

```powershell
python scripts/bone_fea/fetch_case.py --output C:/data/hfvalid
$env:RAINBOWBONE_INPUT = 'C:/data/hfvalid'
$env:RAINBOWBONE_OUTPUT = (Resolve-Path 'frontend/public/models/hfvalid-femur').Path
& 'C:/tools/Slicer/Slicer.exe' --no-splash --no-main-window --python-script scripts/bone_fea/import_femur_in_slicer.py
& 'C:/tools/Slicer/Slicer.exe' --no-splash --no-main-window --python-script scripts/bone_fea/prepare_femur_in_slicer.py
& 'C:/tools/tetgen.exe' '-pYq1.4a80z' frontend/public/models/hfvalid-femur/bone-surface.poly
python scripts/bone_fea/test_solve.py
python scripts/bone_fea/build_model.py --mesh frontend/public/models/hfvalid-femur/bone-surface.1.node
cd frontend
npm run build
```

Wait for each Slicer process to finish before starting the next command. The
source downloader uses HTTP byte ranges to retrieve only one case from the
public nested ZIP archive. ZIP CRCs and the import script's SHA-256 checks
verify the downloaded files. No entire 3 GB archive is needed. Quote the TetGen
switches in PowerShell; otherwise decimal arguments can be split.

Only the generated VTP, VTU, segmentation, provenance and manifests need to be
served. The full CT and TetGen intermediate files need not be committed.

## STL for 3D printing

The dashboard viewer provides **3D print bone · STL**. The download converts the intact,
full-resolution `slicer-surface.vtp` to binary STL, retaining all 143,016 triangles
and the original millimeter scale (84.1 × 64.4 × 397.0 mm). It is independent of
the cut-away, FEA frame, and display magnification. A translation centers XY and
puts minimum Z at zero without rotating, scaling, smoothing, or decimating.
STL contains geometry only; import the coordinates as millimeters.

Regenerate the STL and its report with Python, VTK and NumPy, or Slicer's Python:

```powershell
& 'C:/tools/Slicer/bin/PythonSlicer.exe' scripts/bone_fea/export_print_mesh.py
```

The exporter checks finite coordinates, nonzero triangle areas, closed and
manifold edges, consistent outward winding, one connected component, and
positive volume. It reads the STL back and verifies triangle count, dimensions,
and volume. `bone-print.json` records the checks, source/output hashes, and the
HFValid CC BY 4.0 attribution. Include both generated print files when deploying.

Open the STL in Bambu Studio or another compatible slicer, select the printer,
and scale or split it to fit. At 50% uniform scale the height is 198.5 mm. Choose
orientation and supports, then slice and inspect the preview before printing.

## Printable reconstruction of simulated missing material

The Physics Simulations side panel provides **Print missing region** for the
selected compression step. It is outside the fullscreen press viewer. Steps
before visible element erosion have no missing-region export. The interactive
preview uses the exported STLs themselves; cyan shows the insert, with an
optional view inside its matching remaining femur.

```powershell
& 'C:/tools/Slicer/bin/PythonSlicer.exe' scripts/bone_fea/test_reconstruction.py
& 'C:/tools/Slicer/bin/PythonSlicer.exe' scripts/bone_fea/export_reconstruction.py
```

The exporter requires VTK, NumPy and SciPy. It checks the simulation's source
mesh hash, matches each saved frame's original Float32 coordinates and owning
element IDs to the tetrahedral mesh, then floods the element adjacency graph
without crossing the saved boundary. The complement is the removed region.
It verifies the **entire** recovered boundary and the reported eroded volume
for every step, including steps with no erosion, and checks irreversible
removal through the saved history. No additional FEA solve or threshold based
on surface colors is used.

Raw element erosion produces pinched edges/vertices and very small loose
fragments. For printing only, the exporter absorbs nearby tetrahedral slivers
into the insert until each part is manifold. Around pinches it retains the
largest remaining fan or connects missing fans through a minimum-volume local
path. Remaining fragments below 5 mm³ are also absorbed into the insert.
Every added element ID and volume is recorded; the UI displays the added
percentage. This adjustment can be substantial in early break steps and is
not a recalculated damage prediction. The simulation files remain unchanged.

The adjusted missing and remaining element sets are complementary: they fill
the original FEA mesh without volume overlap. Their shared interface uses
identical triangles with opposite winding. Each face-connected component is
exported separately. No vertex is smoothed, displaced or scaled. All parts
share one translation in millimeters. The existing intact anatomy STL uses a
different surface resolution; use the **matching reconstruction ZIP** to
assemble the printed demonstration.

Validation checks finite coordinates, nonzero triangles, closed edges, face
winding, nonmanifold vertices, connected surfaces, positive volume, agreement
with tetrahedral volume, STL round trips and total reconstructed volume. The
ZIP contains all matching STLs, their report and printing instructions. No fit
clearance is applied. Scale all parts uniformly together; inspect thin features,
support requirements and assembly access in the slicer, then test physical fit.
This represents simulated element erosion, not measured tissue loss or an implant.

## Finite-element calculation

SfePy assembles and solves three-dimensional, small-strain linear elasticity
on **60,819 four-node tetrahedra / 17,361 nodes**, using these explicit assumptions:

- Homogeneous isotropic material: E = 10,000 MPa, Poisson ratio = 0.3.
- Fix all displacement components at nodes within 15 mm of minimum Z.
- Apply uniform negative-Z traction to exterior faces whose vertices are
  within 8 mm of maximum Z and within 25 mm of the source femoral-head center.
- Integrate traction over the selected area for an **800 N** resultant.

The boundary follows the complete Slicer surface. TetGen's boundary preservation
can prevent its requested 80 mm3 volume target from being met locally; the
manifest records both the target and actual maximum, not a claimed uniform
resolution. No mesh-convergence claim is made.

SfePy evaluates the six-component Cauchy stress tensor and von Mises stress in
each element. The VTU retains raw element stresses and solved displacement
vectors. For continuous screen contours, the VTP also carries volume-weighted
nodal averages of the solved element von Mises values. The legend reports that
nodal field's range. No procedural stress gradient is used. Geometry remains
undeformed in all views; smooth lighting does not change mesh positions.

Generation rejects non-finite results or relative equilibrium errors above
1e-6. Tests check analytical bar compression (F/A and FL/EA), linear load
scaling, support reactions, thick loading patches, positive tetrahedra, and a
closed surface. The committed report records the actual support reaction,
free-DOF residual, force-balance error, peak values, versions and checksums.

This is an illustrative FEA with assumed material and constraints. It is not
a reproduction of the dataset authors' clinical analyses, a validated
fracture-risk model, or a mesh-converged result. The surrounding dashboard
cards and history are not results for this reference case.

## Attribution and license

Aldieri, Alessandra; La Mattina, Antonino Amedeo; Szyszko, Julia Aleksandra;
Baruffaldi, Fabio; Viceconti, Marco (2025). *HFValid collection: Hip-Fracture
validation collection*. University of Bologna.
[DOI: 10.6092/unibo/amsacta/8431](https://doi.org/10.6092/unibo/amsacta/8431).

Source data and derived assets are attributed under
[Creative Commons Attribution 4.0](https://creativecommons.org/licenses/by/4.0/).
Changes: Slicer import/export, surface reduction, tetrahedral meshing, new
illustrative FEA, and browser visualization. Original source hashes and the
processing settings are included in the manifest.

## Hydraulic press demonstration

The `/physics-simulations` route uses its own displacement-controlled solve;
it does not scale the overview's 800 N field. Generate its assets with:

```powershell
python scripts/bone_fea/test_press.py
python scripts/bone_fea/build_press.py --checkpoint <local-checkpoint.npz>
```

The same femur tetrahedra are used. All distal nodes within 15 mm of minimum Z
are fixed; a prescribed negative-Z stroke is applied to the head cap (top 8 mm,
within 25 mm of the head center). Lateral motion of that cap remains free.
Reaction force is recovered from the constrained DOFs, not guessed from an
animation. The visible rig is schematic: contact and hydraulic fluid mechanics
are not solved.

Material damage is an illustrative irreversible scalar stiffness reduction.
The driver uses volume-weighted strain tensors averaged over a 3 mm radius
around element centroids. Its asymmetric principal-strain limits are 0.0073
in tension and 0.0104 in compression. These limits are motivated by published
bone FE methods, including this [published experimental protocol](https://www.jove.com/t/64947/imaging-of-the-microstructural-failure-mechanism-in-the-human-hip),
but this material/softening model has not been calibrated or validated against
that protocol or this patient. The softening coefficient (3), residual stiffness
(0.5%), averaging length (3 mm), and fixture exclusion distances are explicit
model assumptions in the generated report.

Each loading step alternates an equilibrium solve and a damage update until
the damage residual is below 0.002. Every exported step passes free-DOF and
force-balance checks (relative tolerance 1e-6). The first assumed strain limit
sets the stroke schedule; it is not a clinical fracture-load estimate.
Each run allows up to 200 damage iterations per step and refuses to write a
completed manifest if convergence fails. An optional `--checkpoint` path outside
`frontend/public/` preserves progress; it is valid only for the exact same mesh and scripts.

For the failure preview, elements with damage at least 0.95 are removed only
from the rendered surface. Newly exposed tetrahedral faces come from that
actual damaged region. The mechanical solve retains residual stiffness, so
the visible gap is not a discrete crack, detached-fragment, or contact result.
The FEA steps do not use a hand-authored crack plane.

The viewer replays the saved loading history, with one fixed color range per
field across all steps. Stress colors use the largest per-step 99th percentile
of visible nodal stress as their cap, so isolated numerical peaks do not hide
changes elsewhere. Higher values saturate red, as labeled in the legend;
the reported peaks and stored stress arrays are not clipped.
Von Mises stress is not this model's failure criterion. The default
`failure_index` view (Failure proximity) colors each surface face with its owning
element's historical principal-strain / limit ratio (`element_failure_index`).
It uses the exact
averaged strain, asymmetric limits, and fixture exclusions from the damage
law. The scale is fixed at 0–1; red means the assumed initiation limit has
been reached, not high current stress or a clinical risk probability. Fixture
elements excluded from failure are gray using `element_failure_eligible`; they
are not presented as low-strain blue. The original nodal fields remain in the
files for inspection, but do not drive the default failure colors. The surface
map shows damage initiation, not a guarantee of a later crack path.
The Before break shortcut shows the last converged step before visible
erosion, not an interpolated estimate of the instant of fracture.
Display deformation defaults to 10x and is explicitly
labeled; all numbers remain unamplified. Selecting an earlier step is playback,
not an unloading/healing simulation. Early detection would require calibrated
patient material properties, a validated failure model, and independent
clinical validation, none of which is claimed by this demonstration.

Playback stops at the final solved FEA step.
