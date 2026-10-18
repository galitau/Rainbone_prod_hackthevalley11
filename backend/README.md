# RainbowBone FEA backend

## Run locally

```bash
cd backend
python -m pip install -r requirements.txt
uvicorn main:app --reload
```

The API exposes `GET /health`, `POST /api/simulate`, `POST /api/explain` and
`GET /api/history`. The simulation endpoint
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
   component is kept, and the volume is cropped to its bounding box. When
   FSL is installed, FSL makes this mask; otherwise numpy/scipy do. Both give
   the same mask (see "Bone segmentation with FSL").
3. Material: each bone voxel's HU is mapped to a Young's modulus with the
   existing bounded linear map in `hu_to_apparent_density_and_modulus`:
   E = 10 + 15 × clip(((HU + 1000) / 2000 − 0.15) / 0.85, 0, 1) GPa. The
   material is isotropic with Poisson ratio 0.3.
4. Coarsening: if the component has more than 8,000 voxels, voxels are merged
   into blocks of whole voxels per axis, chosen to be as close to cubic as
   the scan spacing allows (for 0.703 × 0.703 × 2 mm voxels, 6 × 6 × 2 blocks
   of 4.22 × 4.22 × 4 mm). The block edge grows until the mesh has 8,000
   blocks or fewer. A block is meshed when it holds any bone voxel, so a thin
   cortical wall stays one connected wall. Its modulus is the mean modulus
   of its bone voxels times its bone fraction (bone voxels / block voxels),
   so the coarse mesh keeps the stiffness of the bone it holds. The
   effective voxel size, node and element counts, support reaction and solve
   time are logged at INFO by the `services.fea_solver` logger. uvicorn's
   default logging setup does not print INFO from application loggers.
5. Mesh: each voxel (or block) is split into six equal-volume 4-node
   tetrahedra in the volume's own axes (array axes 0, 1, 2 as x, y, z, in
   mm). Each element takes the modulus of its voxel or block.
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
| `max_von_mises_stress_mpa` | 99.5th percentile, over the bone volume, of the element von Mises stresses, not the single-element maximum, so a few corner elements of the voxel mesh do not set the value. With coarsening, a block's stress is divided by its bone fraction: the stress in the bone it holds. |
| `average_youngs_modulus_gpa` | Mean modulus of the bone voxels in the component. |
| `bone_volume_cm3` | Volume of the segmented component (bone voxels × voxel volume). Coarsening does not change it. |
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
  below it is 12.63, 12.61 and 10.20 MPa, and 17 of the 609 elements at or
  above the 1.5-band value lie that close to either end.
- Coarsening smooths the geometry into blocks and averages the bone inside
  each block; it does not resolve a wall thinner than a block, so the
  reported stress is an estimate at block scale. The bone volume the mesh
  carries (block volume × bone fraction, summed) equals the segmented volume:
  408.83 cm³ for the femur-shaped volume below, in a 537.71 cm³ block mesh.
  On a 400 mm hollow tube with a 13 mm outer radius and a 2 mm wall
  (0.703 × 0.703 × 2 mm voxels at 1,200 HU, coarsened 4 × 4 × 1), the
  reported stress is 5.91 MPa against 5.62 MPa for load / wall area;
  `tests/test_simulate.py` checks it stays within 10%.
- No mesh-convergence study has been made. This is not a medical device, and
  no output is a clinical measurement.

## Bone segmentation with FSL

When `FSLDIR` (shell or `backend/.env`) points at an FSL install, step 2 runs
as two FSL commands on a temporary copy of the volume
(`services/fsl_segmentation.py`):

```bash
fslmaths ct.nii -thr 150 -bin mask.nii -odt char   # voxels at or above 150 HU
connectedcomp mask.nii labels.nii 6                 # face-connected components
```

The largest component is kept; on a tie, the one that comes first in C order,
as `scipy.ndimage.label` numbers them. NaN voxels are written as −1000 HU and
±inf as the largest finite values, which is how the numpy path treats them.
Without `FSLDIR`, or when a command is missing, fails or runs over 60 s, the
numpy/scipy path runs instead, with a warning when `FSLDIR` was set. The
`segmentation` entry of the INFO log says which one ran. The response fields
do not change.

FSL does not make the mask more accurate: it runs the same threshold and
connected-component steps. Measured with the FSL packages `fsl-avwutils`
2209.8 and `fsl-cluster` 2201.0, segmentation only, 3 runs each:

| Volume | Bone voxels kept | Same mask as numpy/scipy | FSL | numpy/scipy |
|---|---|---|---|---|
| `public/sample_bone.nii.gz` | 3,048 | yes | 0.04–0.08 s | under 0.01 s |
| Femur-shaped volume (see Example response), 256 × 331 × 220 | 413,475 | yes | 1.18–1.27 s | 0.26–0.31 s |

The femur-shaped volume gives the same response either way (12.61 MPa,
22.35 GPa, 408.83 cm³, index 8.4).

FSL is optional and is not in `requirements.txt`. It runs on macOS and Linux,
and on Windows only through WSL. It is free for non-commercial use under its
own licence (<https://fsl.fmrib.ox.ac.uk/fsl/docs/license.html>). Only
`fslmaths` and `connectedcomp` are needed; FSL's conda instructions
(<https://fsl.fmrib.ox.ac.uk/fsl/docs/install/conda.html>) install them
without the rest of FSL. The tested install, with micromamba:

```bash
micromamba create -y -p ~/fsl-bone --override-channels \
  -c https://fsl.fmrib.ox.ac.uk/fsldownloads/fslconda/public/ -c conda-forge \
  fsl-avwutils fsl-cluster
```

Then set `FSLDIR` to that folder (`~/fsl-bone`). A full FSL install also
works.

`tests/test_fsl_segmentation.py` always checks the fallback. When `FSLDIR` is
set it also checks that FSL and numpy/scipy give the same mask for threshold
edges (exactly 150 HU, 149.99 HU, NaN, ±inf), corner-only contact, a tie, C-
and Fortran-ordered arrays and the femur-shaped volume, and that
`/api/simulate` returns the same response for the sample either way.
Without `FSLDIR` those tests are skipped with the reason.

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
error below 1e-12. The largest element stress was 38.26 MPa.

Measured request times (curl `time_total`) on one development laptop:

| Input | Bone voxels | Coarsening | FE voxels | Time |
|---|---|---|---|---|
| `public/sample_bone.nii.gz` | 3,048 | none, 1 mm | 3,048 | 1.81 s first request (includes importing SfePy), 1.30 s after |
| Solid 40 mm cube (test case) | 64,000 | 2 × 2 × 2, 2 mm | 8,000 | 5.56 s, 5.81 s |
| Femur-shaped volume, 256 × 331 × 220 voxels of 0.703 × 0.703 × 2 mm¹ | 413,475 | 6 × 6 × 2, 4.22 × 4.22 × 4 mm | 7,553 | 2.42 s, 2.39 s |

¹ The HFValid Pat001 right-femur labelmap already in this repository
(`public/models/hfvalid-femur/bone.seg.nrrd`; source and CC BY 4.0
attribution in `scripts/bone_fea/README.md`), with every femur voxel set to
700 HU and the rest to −1000 HU. These are not the scan's real HU values, so
the modulus is uniform. Its response: 12.61 MPa, 22.35 GPa, 408.83 cm³,
index 8.4. `tests/test_simulate.py` builds the same volume and checks it
answers in under 20 s.

## Plain-language explanation

`POST /api/explain` turns the numbers `POST /api/simulate` already computed
into a short explanation for a reader without an engineering background (a
bone carries load like a bridge; a thinner or weaker bone carries it through
less material). Language models only word those numbers; they never compute
one, and a checker rejects any text that uses a number which was not supplied.

### Request

The `/api/simulate` response, posted as it is (JSON):

| Field | Required | Sent to a model as |
|---|---|---|
| `max_von_mises_stress_mpa` | yes | `max_von_mises_stress_mpa` |
| `average_youngs_modulus_gpa` | yes | `average_youngs_modulus_gpa` |
| `bone_volume_cm3` | yes | `bone_volume_cm3` |
| `fracture_risk_index_percent` | yes (0 to 100) | `illustrative_index_percent` |
| `load_newtons` | no (default 800, as in `/api/simulate`) | `load_newtons` |
| `mesh_vertices`, `mesh_faces`, `source_filename` | no | never sent |

Numbers are rounded to 2 decimals before a model sees them. The index is
renamed so a model words it as an illustrative index, not as a fracture risk.
Strings or booleans in a number field, negative or out-of-range values,
NaN and infinity are refused with 422; unknown fields are ignored and never
sent.

### Response

```json
{"text": "...", "provider": "gemini", "model": "gemini-3.8-flash", "fallbacks": []}
```

`provider` is `gemini`, `groq` or `template`; `model` is null for the
template. `fallbacks` lists, in order, every model that did not answer and why
(`GEMINI_API_KEY not set`, `gemini-3.8-flash: HTTP 503`,
`gemini-3.8-flash: timed out after 10 s`,
`openai/gpt-oss-120b: rejected: number not in input: 60`, ...). Every `text`
ends with the same fixed sentence, added by code: "Illustrative engineering
simulation with assumed material properties, not a medical assessment."

### Provider chain

1. Gemini (`GEMINI_MODEL`, default `gemini-3.8-flash`): REST
   `generateContent` with a JSON response schema and thinking level LOW,
   timeout 10 s. When that model answers with an HTTP error (429, 503, ...) or
   is cooling down, `gemini-3.5-flash-lite` is tried before leaving Gemini. A
   timeout, a connection error or a rejected text goes straight to Groq.
2. Groq (`GROQ_MODEL`, default `openai/gpt-oss-120b`) through its
   OpenAI-compatible chat completions endpoint with a strict JSON schema,
   timeout 8 s.
3. Template: deterministic sentences built from the same numbers. No
   network, and it passes the checker for every valid request.

A provider without a key is skipped. A model whose call failed (HTTP error,
timeout, connection error) is skipped for 60 s, so later requests do not wait
for the same failure. A rejected text does not start that pause. The pause is
kept in process memory. Responses are not cached.

Live check on 2026-10-17 (our keys, the test request below):
`gemini-3.8-flash` answered in 2.5 s, 3.3 s, 7.9 s and 18.2 s, timed out
once at 10 s and returned HTTP 503 twice; `gemini-3.5-flash-lite` answered
5 times in 0.8 to 1.4 s; Groq answered once in 1.1 s. Every answer passed
the checker. For a live demo,
`GEMINI_MODEL=gemini-3.5-flash-lite` in `backend/.env` avoids the slow model.

### Checker

A model's text is rejected when it:

- is empty, cut off at the token limit, or longer than 700 characters;
- contains a number that is not one of the rounded inputs, or one of them
  rounded to 1 or 0 decimals. Numbers are digit tokens that do not follow a
  letter, so `cm3` is not a number but `15mm` is; `10,000` reads as one
  number; signs are ignored;
- spells out a quantity (`one`, `two`, `half`, `twice`, ...);
- uses clinical or outcome wording (`diagnos`, `predict`, `recommend`,
  `should`, `surg`, `treat`, `therap`, `risk`, `cancer`, `fractur`, ...).

The word lists come from the team's earlier AI interface contract. The
checker proves that no number was invented. It cannot prove that a supplied
number is attached to the right quantity.

### Configuration

Copy `backend/.env.example` to `backend/.env` and fill in the keys. `.env`
files are gitignored. Process environment variables override the file.

| Variable | Default | Use |
|---|---|---|
| `AI_CHAIN` | `gemini,groq,template` | Order; `template` is appended when missing. Unknown names give HTTP 500 with the reason. |
| `AI_OFFLINE` | `0` | `1` answers with the template only and makes no network calls |
| `GEMINI_API_KEY`, `GEMINI_MODEL` | `gemini-3.8-flash` | Gemini Developer API |
| `GROQ_API_KEY`, `GROQ_MODEL` | `openai/gpt-oss-120b` | Groq |

Keys are sent only in request headers and are never logged or returned.

### Example

Test values in the `/api/simulate` response shape (not a solver output),
with `AI_OFFLINE=1`:

```json
{"max_von_mises_stress_mpa": 41.98, "average_youngs_modulus_gpa": 17.25, "bone_volume_cm3": 408.09,
 "fracture_risk_index_percent": 27.99, "load_newtons": 800.0}
```

```json
{"text": "A bone carries load the way a bridge does: the weight travels through its material, and a thinner or weaker bone carries the same weight through less material, so that material is squeezed harder. In this computer model, 408 cm³ of bone carried a load of 800 newtons. Near its most heavily loaded spots, the stress inside it (how hard the material is squeezed or pulled) reached 42 MPa. The bone material was given an average stiffness (Young's modulus) of 17.2 GPa. The index of 28% is illustrative only: it compares that stress with an assumed bone strength and is not a medical measurement. Illustrative engineering simulation with assumed material properties, not a medical assessment.",
 "provider": "template", "model": null, "fallbacks": []}
```

### Tests

`tests/test_explain.py` runs with the backend tests above and needs no
network: provider calls go to `httpx.MockTransport`.

## Simulation history (TimescaleDB)

Each successful `POST /api/simulate` is also saved as one row of the
`simulation_runs` TimescaleDB hypertable, and `GET /api/history` returns the
latest runs. History is optional: without `DATABASE_URL` nothing is saved,
`/api/history` answers 503, and `/api/simulate` behaves exactly as before.

### Configuration

One variable, listed without a value in `backend/.env.example`. Put it in
`backend/.env` (gitignored; never commit it) or set it in the shell; the shell
wins, as for the explanation keys.

- `DATABASE_URL`: PostgreSQL connection string of a database with TimescaleDB,
  e.g. a Tiger Cloud service (the connection string from the Tiger console,
  with its options such as `?sslmode=require`) or a local
  `timescale/timescaledb` container.

Apply the schema once, then start the API (the same commands work in bash):

```powershell
cd backend
python -m services.history migrate
uvicorn main:app --reload
```

The schema is applied only by `python -m services.history migrate`, never at
API start. The command runs every `migrations/*.sql` file in name order, each
in its own transaction. Every file is idempotent, so re-running is safe.

### What is stored

`migrations/001_simulation_runs.sql` creates:

- `simulation_runs`, a hypertable on `time` with 7-day chunks: the run time,
  a `run_id`, every `SimulationResponse` field exactly as returned, and solver
  information: `solver` (the function that produced the values,
  `services.fea_solver.simulate_fea`), `solver_versions` (installed versions of
  nibabel, numpy, scipy and sfepy) and `solve_ms` (wall
  time of that call in the API process).
- `simulation_runs_hourly`, a real-time continuous aggregate: per UTC hour, the
  number of runs and the average and maximum of `max_von_mises_stress_mpa`. A
  refresh policy materializes buckets between 30 days and 1 hour old, hourly;
  newer rows are read from the hypertable at query time.
- No retention or compression policy.

### `GET /api/history?limit=N`

`N` is 1–500 (default 10). Response to `?limit=1` from a local TimescaleDB
container after four uploads of `public/sample_bone.nii.gz` (two with curl,
two from the dashboard):

```json
{
  "series": [
    {
      "label": "Oct 18 02:54:44 UTC",
      "value": 17.71
    }
  ],
  "runs": [
    {
      "time": "2026-10-18T02:54:44.927713Z",
      "run_id": "5d2049c1-3a90-4a62-b579-c3c3704ac14c",
      "source_filename": "sample_bone.nii.gz",
      "max_von_mises_stress_mpa": 17.71,
      "average_youngs_modulus_gpa": 22.79,
      "bone_volume_cm3": 3.05,
      "fracture_risk_index_percent": 11.81,
      "load_newtons": 800.0,
      "mesh_vertices": 1610,
      "mesh_faces": 3216,
      "solver": "services.fea_solver.simulate_fea",
      "solver_versions": {
        "numpy": "2.5.4",
        "scipy": "1.18.1",
        "sfepy": "2026.3",
        "nibabel": "5.4.2"
      },
      "solve_ms": 1418.8740420067916
    }
  ],
  "hourly": [
    {
      "bucket": "2026-10-18T02:00:00Z",
      "runs": 4,
      "avg_max_von_mises_stress_mpa": 17.71,
      "max_max_von_mises_stress_mpa": 17.71
    }
  ]
}
```

- `series` has the shape of `mockStressSeries` in `lib/mock-data.ts`: one
  point per run, `value` = `max_von_mises_stress_mpa`, `label` = run time in
  UTC.
- `runs` are the same runs with every stored column; `hourly` holds the latest
  `N` hourly buckets. All lists are oldest first.
- 503 when `DATABASE_URL` is unset, the database is unreachable, or the
  migration has not been run; `detail` says which.

Assumptions and limits:

- History stores what `/api/simulate` returns. It does not change how those
  values are computed and adds no interpretation of them.
- The save runs as a FastAPI background task after the response is sent. A
  failed save is logged as a warning (password masked) and does not change the
  response. A history request sent right after a simulate response may not
  include that run yet.
- Each save and each history request opens one short-lived connection (5 s
  connect timeout). There is no connection pool.
- The dashboard chart still uses `mockStressSeries`; it does not call
  `/api/history`.

### Tests

These run with the backend tests above. `tests/test_history.py` uses a fake
connection. `tests/test_history_timescale.py` starts a throwaway
`timescale/timescaledb:latest-pg16` container on a free 127.0.0.1 port,
migrates it, saves runs through `/api/simulate`, reads `/api/history`, and
removes the container. It is skipped, with the reason, when Docker is not
available. Both files override `DATABASE_URL` for their own run, so they never
connect to the database configured in your shell or `backend/.env`;
`tests/test_simulate.py` sets it empty, so it saves nothing. Docker is
found from the `DOCKER` environment variable, then `docker` on `PATH`, then
`~/.docker/bin/docker`. Most tests that need a successful solve replace
`simulate_fea` with fixed test values; one test in `tests/test_history.py`
posts the bundled sample through the real solver.
