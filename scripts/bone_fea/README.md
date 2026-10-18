# Complete femur with computed FEA

The dashboard viewer loads the static model in `public/models/hfvalid-femur`.
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
$env:RAINBOWBONE_OUTPUT = (Resolve-Path 'public/models/hfvalid-femur').Path
& 'C:/tools/Slicer/Slicer.exe' --no-splash --no-main-window --python-script scripts/bone_fea/import_femur_in_slicer.py
& 'C:/tools/Slicer/Slicer.exe' --no-splash --no-main-window --python-script scripts/bone_fea/prepare_femur_in_slicer.py
& 'C:/tools/tetgen.exe' '-pYq1.4a80z' public/models/hfvalid-femur/bone-surface.poly
python scripts/bone_fea/test_solve.py
python scripts/bone_fea/build_model.py --mesh public/models/hfvalid-femur/bone-surface.1.node
npm run build
```

Wait for each Slicer process to finish before starting the next command. The
source downloader uses HTTP byte ranges to retrieve only one case from the
public nested ZIP archive. ZIP CRCs and the import script's SHA-256 checks
verify the downloaded files. No entire 3 GB archive is needed. Quote the TetGen
switches in PowerShell; otherwise decimal arguments can be split.

Only the generated VTP, VTU, segmentation, provenance and manifests need to be
served. The full CT and TetGen intermediate files need not be committed.

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
