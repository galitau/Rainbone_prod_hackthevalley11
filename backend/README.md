# RainbowBone FEA backend

## Run locally

```bash
cd backend
python -m pip install -r requirements.txt
uvicorn main:app --reload
```

The API exposes `GET /health` and `POST /api/simulate`. The simulation endpoint
accepts a multipart form upload named `file` containing a `.nii` or `.nii.gz`
NIfTI volume. The dashboard posts `public/sample_bone.nii.gz` to
`http://127.0.0.1:8000/api/simulate`, uvicorn's default port.

The solver is imported from `scripts/bone_fea/solve.py`, so run the backend
from a full checkout of the repository. `python-multipart` is needed for the
upload form; `httpx2` is only used by the tests (Starlette's test client).

Tests (the same commands work in PowerShell):

```bash
cd backend
python -m unittest -v
cd ..
python scripts/bone_fea/test_solve.py
python scripts/bone_fea/test_element_moduli.py
```

`test_solve.py` keeps the solver's default output and leaves a `domain.vtk`
in the working directory; delete it rather than committing it. The API and
the other tests pass `save_results=False` and write no files.

## What `/api/simulate` computes

`services/fea_solver.py` runs a three-dimensional, small-strain, linear-elastic
finite-element solve with SfePy. It uses the same `tetrahedralize` and
`solve_elasticity` functions as the static femur model in `scripts/bone_fea`.

1. Read the upload with nibabel (NIfTI-1 or NIfTI-2, optionally gzipped).
   `nib.load()` takes a file path, not an in-memory upload (nibabel 5.4.2
   raises `TypeError` for a `BytesIO`), so gzip uploads are decompressed and
   parsed with `Nifti1Image.from_bytes` (or `Nifti2Image`). Voxel spacing
   comes from the header.
2. Bone mask: voxels at or above 150 HU. Only the largest face-connected
   component is kept, and the volume is cropped to its bounding box.
3. Material: each bone voxel's HU is mapped to a Young's modulus with the
   existing bounded linear map in `hu_to_apparent_density_and_modulus`:
   E = 10 + 15 × clip(((HU + 1000) / 2000 − 0.15) / 0.85, 0, 1) GPa. The
   material is isotropic with Poisson ratio 0.3.
4. Coarsening: if the component has more than 8,000 voxels, voxels are merged
   into blocks of whole voxels per axis, chosen to be as close to cubic as
   the scan spacing allows (for 0.703 × 0.703 × 2 mm voxels, 6 × 6 × 2 blocks
   of 4.22 × 4.22 × 4 mm). The block edge grows until the largest remaining
   component has 8,000 voxels or fewer. A block is bone when at least half of
   its voxels are bone; its modulus is the mean of those voxels. The
   effective voxel size, node and element counts, support reaction and solve
   time are logged at INFO by the `services.fea_solver` logger. uvicorn's
   default logging setup does not print INFO from application loggers.
5. Mesh: each voxel is split into six equal-volume 4-node tetrahedra in the
   volume's own axes (array axes 0, 1, 2 as x, y, z, in mm). Each element
   takes the modulus of its voxel.
6. Boundary conditions: nodes within 1.5 voxel heights of the minimum Z
   (the two lowest node layers) are fixed in all directions. A uniform −Z
   traction on the exterior faces within 1.5 voxel heights of the maximum Z
   integrates to an 800 N compressive resultant.
7. Solve: SciPy direct solver through SfePy. The solve is rejected if
   displacements or stresses are non-finite, or if the relative force-balance
   or free-node residual error exceeds 1e-6.

The solve runs in FastAPI's threadpool, so the server keeps answering other
requests while it runs. Unreadable volumes, volumes without bone, and bone
spanning fewer than 4 voxels along Z return 422. A wrong file extension or an
empty upload returns 400.

## Response fields

| Field | Definition |
|---|---|
| `max_von_mises_stress_mpa` | 99.5th percentile of the element von Mises stresses, not the single-element maximum, so a few corner elements of the voxel mesh do not set the value. |
| `average_youngs_modulus_gpa` | Volume-weighted mean of the element moduli. |
| `bone_volume_cm3` | Volume of the finite-element mesh, after component selection and any coarsening. |
| `fracture_risk_index_percent` | `max_von_mises_stress_mpa` / 150 MPa × 100, clipped to 0–100. The 150 MPa strength is an assumption. This is an illustrative index, not a validated fracture risk. |
| `load_newtons` | Applied compressive resultant, 800 N. |
| `mesh_vertices`, `mesh_faces` | Vertices and triangles of the finite-element mesh's exterior surface. |
| `source_filename` | Uploaded file name. |

## Assumptions and limits

- The input is assumed to be CT in Hounsfield Units. There is no phantom
  calibration, and the HU-to-modulus map is the repository's bounded linear
  map, not a published density–modulus relation.
- The supports and load are placed by the volume's Z extent, not by anatomy.
  Other bone that touches the main component at 150 HU or above is part of
  the solved domain.
- The reported stress depends on how the load is introduced. For the bundled
  sample, the 99.5th percentile is 34.36, 17.71 and 12.41 MPa with bands of
  0.5, 1.5 and 2.5 voxel heights; all of its top 0.5% elements lie within two
  band heights of the clamped or loaded end. For the femur-shaped volume
  below it is 14.01, 13.98 and 12.16 MPa, and none of its top 0.5% elements
  lie that close to either end.
- Coarsening changes the geometry. The femur-shaped volume below has a
  408.83 cm³ component before coarsening and a 408.43 cm³ mesh after it.
- No mesh-convergence study has been made. This is not a medical device, and
  no output is a clinical measurement.

## Bundled sample

`public/sample_bone.nii.gz` is a synthetic 32 × 32 × 32 float32 volume with
1 mm voxels: an ellipsoid with semi-axes of 10, 6 and 12 mm (3,048 voxels) at
750 HU in −1000 HU. It is not anatomy.

The original file was damaged: its header declared the voxel data at byte 352,
but the voxels started at byte 348 (the 4-byte extension flag was missing), so
nibabel read 4 bytes short and every upload of it returned 422. It was
rewritten with nibabel from its own 348-byte header and voxels. The voxel
bytes are unchanged (sha256 `9c2d7ae8adbdf8c40acede58f47e473492a3845d162e41577ab8080bbbc0e1a5`,
checked by `tests/test_simulate.py`), and so is the affine. nibabel
normalised two header fields that meant the same thing: `pixdim[0]` from 0
to 1, and `scl_slope`/`scl_inter` from 0 to NaN (no scaling either way).

## Example response

From a real run of
`curl -F "file=@public/sample_bone.nii.gz" http://127.0.0.1:8000/api/simulate`
(port changed for the run):

```json
{
  "max_von_mises_stress_mpa": 17.71,
  "average_youngs_modulus_gpa": 22.79,
  "bone_volume_cm3": 3.05,
  "fracture_risk_index_percent": 11.81,
  "load_newtons": 800.0,
  "mesh_vertices": 1610,
  "mesh_faces": 3216,
  "source_filename": "sample_bone.nii.gz"
}
```

That run solved 3,909 nodes and 18,288 tetrahedra without coarsening. The
support reaction was 800.0000 N along +Z, with a relative force-balance
error of 1.1e-13. The largest element stress was 38.26 MPa.

Measured request times (curl `time_total`) on one development laptop:

| Input | Bone voxels | Coarsening | FE voxels | Time |
|---|---|---|---|---|
| `public/sample_bone.nii.gz` | 3,048 | none, 1 mm | 3,048 | 1.90 s first request (includes importing SfePy), 1.34 s after |
| Solid 40 mm cube (test case) | 64,000 | 2 × 2 × 2, 2 mm | 8,000 | 5.70 s |
| Femur-shaped volume, 256 × 331 × 220 voxels of 0.703 × 0.703 × 2 mm¹ | 413,475 | 6 × 6 × 2, 4.22 × 4.22 × 4 mm | 5,737 | 1.78 s |

¹ The HFValid Pat001 right-femur labelmap already in this repository
(`public/models/hfvalid-femur/bone.seg.nrrd`; source and CC BY 4.0
attribution in `scripts/bone_fea/README.md`), with every femur voxel set to
700 HU and the rest to −1000 HU. These are not the scan's real HU values, so
the modulus is uniform. Its response: 13.98 MPa, 22.35 GPa, 408.43 cm³,
index 9.32. `tests/test_simulate.py` builds the same volume and checks it
answers in under 20 s.
