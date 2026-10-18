# RainbowBone FEA backend

`GET /api/bones` (CTPelvic1K bone meshes and masks from Vultr Object Storage, `routes_bones.py`)
is documented in [`scripts/vultr_pipeline/README.md`](../scripts/vultr_pipeline/README.md#get-apibones).

## Run locally

```bash
cd backend
python -m pip install -r requirements.txt
python -m pip install -r requirements-dev.txt   # only to run the tests (moto)
uvicorn main:app --reload
```

The API exposes `GET /health`, `POST /api/simulate`, `POST /api/explain`,
`POST /api/risk-analysis`, `GET /api/history` and `GET /api/ai-log`. The simulation endpoint
accepts a multipart form upload named `file` containing a `.nii` or `.nii.gz`
NIfTI volume. The dashboard posts `frontend/public/sample_bone.nii.gz` to
`http://127.0.0.1:8000/api/simulate`, uvicorn's default port.

Browsers may call the API from `http://localhost:3000`, `https://rainbone.health`
and `https://www.rainbone.health`. `CORS_ALLOW_ORIGINS` (comma list, replaces
those) and `CORS_ALLOW_ORIGIN_REGEX` (e.g. for Vercel preview URLs) change
that; see `.env.example`.

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
in the working directory; `.gitignore` lists it so it is not committed. The
API and the other tests pass `save_results=False` and write no files.

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

The solve runs in a worker thread, so the server keeps answering other
requests while it runs. Solves run one at a time; a second upload waits for
the first. SfePy's own progress output is turned off. A wrong file extension
or an empty upload returns 400, and an upload over 512 MiB returns 413.
Unreadable volumes, volumes over 512 × 512 × 512 voxels or over 1,024 MiB
of header and voxel data, volumes without bone, and bone spanning fewer than
4 voxels along Z return 422. The header is read first and only the bytes it
declares are decompressed, so a small gzip file cannot make the server
allocate a large buffer. Crop a larger scan to the bone of interest first.

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

When `FSLDIR` (shell or `backend/.env`; a leading `~` is expanded) points at
an FSL install, step 2 runs as two FSL commands on a temporary copy of the
volume (`services/fsl_segmentation.py`):

```bash
fslmaths ct.nii -thr 150 -bin mask.nii -odt char   # voxels at or above 150 HU
connectedcomp mask.nii labels.nii 6                 # face-connected components
```

The largest component is kept; on a tie, the one that comes first in C order,
as `scipy.ndimage.label` numbers them. NaN voxels are written as −1000 HU and
±inf as the largest finite values, which is how the numpy path treats them.
Without `FSLDIR`, or when a command is missing, fails or runs over 60 s, the
numpy/scipy path runs instead, with a warning when `FSLDIR` was set. The
response fields do not change. To see which one runs:

- At startup uvicorn prints `INFO:     Bone segmentation: FSL (fslmaths,
  connectedcomp in <FSLDIR>/bin)`, or `Bone segmentation: numpy/scipy
  (FSLDIR is not set)`.
- A request that falls back prints a warning.
- Each saved history run stores `segmentation` (`fsl` or `numpy`) in
  `solver_versions`.

FSL does not make the mask more accurate: it runs the same threshold and
connected-component steps, and it is slower. Measured with the FSL packages
`fsl-avwutils` 2209.8 and `fsl-cluster` 2201.0, segmentation only, 3 runs
each:

| Volume | Bone voxels kept | Same mask as numpy/scipy | FSL | numpy/scipy |
|---|---|---|---|---|
| `frontend/public/sample_bone.nii.gz` | 3,048 | yes | 0.04–0.08 s | under 0.01 s |
| Femur-shaped volume (see Example response), 256 × 331 × 220 | 413,475 | yes | 1.14–1.20 s | 0.29–0.31 s |
| Public pelvic CT (CTPelvic1K), 512 × 512 × 350, int32 | 1,905,792 | yes | 6.66–7.17 s | 2.09–2.19 s |

FSL writes the whole volume and its mask and labels to temporary files on
every request. Whole requests for that pelvic CT (curl, 2 runs each) took
12.79 s and 12.63 s with FSL and 6.79 s and 6.05 s without, with the same
response. The femur-shaped volume gives the same response either way
(12.61 MPa, 22.35 GPa, 408.83 cm³, index 8.4).

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

Then put `FSLDIR=~/fsl-bone` in `backend/.env` (or set it in the shell) and
restart uvicorn; the startup line should say FSL. A full FSL install also
works.

`tests/test_fsl_segmentation.py` always checks the fallback. When `FSLDIR` is
set it also checks that FSL and numpy/scipy give the same mask for threshold
edges (exactly 150 HU, 149.99 HU, NaN, ±inf), corner-only contact, a tie, C-
and Fortran-ordered arrays and the femur-shaped volume, and that
`/api/simulate` returns the same response for the sample either way.
Without `FSLDIR` those tests are skipped with the reason.

## Bundled sample

`frontend/public/sample_bone.nii.gz` is a synthetic 32 × 32 × 32 float32 volume with
1 mm voxels: an ellipsoid with semi-axes of 10, 6 and 12 mm (3,048 voxels) at
750 HU in −1000 HU. It is not anatomy.

The original file was damaged: its header declared the voxel data at byte 352,
but the voxels started at byte 348 (the 4-byte extension flag was missing), so
nibabel read 4 bytes short and every upload of it returned 422. It was
rewritten with nibabel from its own 348-byte header and voxels. The voxel
bytes are unchanged (sha256 `9c2d7ae8adbdf8c40acede58f47e473492a3845d162e41577ab8080bbbc0e1a5`,
checked by `tests/test_simulate.py`), and so is the affine. nibabel
normalised two header fields: `pixdim[0]` from 0 to 1, and `scl_slope` from 0
to 1 (`scl_inter` stays 0). Both values mean no scaling.

## Example response

From a real run of
`curl -F "file=@frontend/public/sample_bone.nii.gz" http://127.0.0.1:8000/api/simulate`
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
| `frontend/public/sample_bone.nii.gz` | 3,048 | none, 1 mm | 3,048 | 1.81 s first request (includes importing SfePy), 1.30 s after |
| Solid 40 mm cube (test case) | 64,000 | 2 × 2 × 2, 2 mm | 8,000 | 5.56 s, 5.81 s |
| Femur-shaped volume, 256 × 331 × 220 voxels of 0.703 × 0.703 × 2 mm¹ | 413,475 | 6 × 6 × 2, 4.22 × 4.22 × 4 mm | 7,553 | 2.42 s, 2.39 s |

¹ The HFValid Pat001 right-femur labelmap already in this repository
(`frontend/public/models/hfvalid-femur/bone.seg.nrrd`; source and CC BY 4.0
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

The `/api/simulate` response, posted as it is (JSON), or `{"case_id": "Pat001"}`:
the API then reads the femur model's numbers from Vultr Object Storage itself
(see [Where the AI facts come from](#where-the-ai-facts-come-from-vultr-object-storage)),
and the four required fields below are not needed.

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
{"text": "...", "provider": "gemini", "model": "gemini-3.8-flash", "served": "live", "saved_at": null,
 "fallbacks": [], "grounding": null, "logged": null}
```

`grounding` is null when the numbers came in the request, and says where they
were read from with a `case_id`; `logged` is the
[AI audit log](#ai-audit-log-tiger-cloud) row, or null.

`provider` is `gemini`, `groq` or `template`; `model` is null for the
template. `served` is `live` (written for this request), `cached` (kept in
memory from an earlier request) or `saved` (no Gemini model answered, so this
is the Gemini answer saved earlier for the same facts; `model` is the model
that wrote it and `saved_at` when, ISO 8601 UTC; `saved_at` is null
otherwise). A saved answer is not written to the AI audit log, since no model
was called for it. `fallbacks` lists, in order, every model that did not answer and why
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
   timeout, a connection error or a rejected text leaves Gemini at once
   (step 2, then Groq). With
   more keys in `GEMINI_API_KEYS`, a key that is invalid or refused (HTTP 400,
   401, 403) is followed by the next key for the same model; a 429 is never
   retried with another key.
2. Saved Gemini answer: when no Gemini model answers, the Gemini answer saved
   for exactly the same route, facts and prompts (`AI_ANSWER_STORE`) is
   served with `served: "saved"`, the model that wrote it and `saved_at`, if
   it still passes the checker. Only answers Gemini returned with its
   `responseId` and `modelVersion` are saved.
3. Groq (`GROQ_MODEL`, default `openai/gpt-oss-120b`) through its
   OpenAI-compatible chat completions endpoint with a strict JSON schema,
   timeout 8 s.
4. Template: deterministic sentences built from the same numbers. No
   network, and it passes the checker for every valid request.

A provider without a key is skipped. A model whose call failed (HTTP error,
timeout, connection error) is skipped for 60 s, so later requests do not wait
for the same failure. A rejected text does not start that pause. The pause is
kept in process memory. Answers are kept in memory, and every checked Gemini
answer is also saved to `AI_ANSWER_STORE`.

Live checks on 2026-10-17 (our keys). With the test request below:
`gemini-3.8-flash` answered in 2.5 s, 3.3 s, 7.9 s and 18.2 s, timed out
once at 10 s and returned HTTP 503 twice; `gemini-3.5-flash-lite` answered
5 times in 0.8 to 1.4 s; Groq answered once in 1.1 s. With the bundled
sample's response and the current checker: `gemini-3.8-flash` returned
HTTP 429 and was then skipped; `gemini-3.5-flash-lite` answered 6 times in
0.74 to 2.67 s; Groq (`AI_CHAIN=groq`) answered 3 times in 1.12 to 1.60 s.
Every answer passed the checker. For a live demo,
`GEMINI_MODEL=gemini-3.5-flash-lite` in `backend/.env` avoids the slow model.

### Checker

A model's text is rejected when it:

- is empty, cut off at the token limit, or longer than 700 characters;
- contains a number that is not one of the rounded inputs, or one of them
  rounded to 1 or 0 decimals. Every digit run is a number, also after a
  letter or a point (`15mm`, `x40`, `.5`), except the 2 or 3 of a unit such
  as `cm3`, `mm2` or `cm^3`; `10,000` reads as one number; signs are ignored;
- spells out a quantity: zero to nineteen, the tens, hundred, thousand,
  million, billion, trillion and dozen, with their plurals and -fold forms
  (`hundreds`, `tenfold`), and `half`, `third`, `quarter`, `double`, `twice`,
  `triple`, `quadruple` and their forms;
- contains a blocked word stem: `diagnos`, `predict`, `recommend`, `should`,
  `surg`, `treat`, `therap`, `respond`, `likely`, `probab`, `chance`, `risk`,
  `cancer`, `metasta`, `prognos`, `urgent`, `fractur`, `break`/`broke`,
  `crack`, `fail`, `safe`, `danger`, `health`, `osteopor`, `patient`,
  `doctor`, `withstand`.

The first list of stems comes from the team's earlier AI interface
contract; the stems from `break` on were added for bone loading. The checker
rejects digits and number words that are not supplied values, and the listed
stems; other wording, such as a quantity in a phrase the lists do not cover,
or a supplied number attached to the wrong quantity, is not caught.

### Configuration

Copy `backend/.env.example` to `backend/.env` and fill in the keys. `.env`
files are gitignored. Process environment variables override the file.

| Variable | Default | Use |
|---|---|---|
| `AI_CHAIN` | `gemini,groq,template` | Order; `template` is appended when missing. Unknown names give HTTP 500 with the reason. |
| `AI_OFFLINE` | `0` | `1` answers with the template only and makes no network calls |
| `GEMINI_API_KEY`, `GEMINI_MODEL` | `gemini-3.8-flash` | Gemini Developer API |
| `GEMINI_API_KEYS` | empty | More Gemini keys, comma list, tried after `GEMINI_API_KEY` when a key is invalid or refused (HTTP 400, 401, 403); never after a 429 |
| `AI_ANSWER_STORE` | `backend/.ai-answers.json` | File of saved Gemini answers (gitignored; a relative path is under `backend/`). Read and rewritten whole on each save, so it assumes one server process |
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

## AI fracture risk analysis

`POST /api/risk-analysis` explains how likely one HFValid femur is to break,
from the dataset authors' published numbers. It reads the HFValid table from
Vultr Object Storage (`clinical/hfvalid/hfvalid-risk.json`), with
`frontend/public/models/hfvalid-risk.json` as the bundled backup copy (see
[Where the AI facts come from](#where-the-ai-facts-come-from-vultr-object-storage)): per subject, the
Absolute Risk of Fracture at time 0 (ARF0) and the Minimum Sidefall Strength
(MSF) computed with the authors' finite-element model, and whether
a hip fracture was recorded in the follow-up (HFValid collection, Aldieri,
La Mattina, Szyszko, Baruffaldi, Viceconti 2025, University of Bologna,
DOI 10.6092/unibo/amsacta/8431, CC BY 4.0). Sideways-fall forces of 2,900 N
to 4,260 N on the hip are from van den Kroonenberg et al. 1995
(PubMed 8618384).

Request: `{"case_id": "Pat001", "fe": {"peak_stress_mpa": 15.83,
"load_newtons": 800, "stress_index_percent": 10.55}}`; `fe` (our own
standing-load solve) is optional. It is echoed in `facts.fe` but never sent
to a model, and its numbers may not appear in `text`. An unknown `case_id`
returns 404, a bad body 422, and data that neither the bucket nor the
bundled copy can give 503.

The code computes every number in `facts` from the published values (the
table keeps the CSV's precision): the subject's age, ARF0 (1 decimal) and how
many subjects had a lower ARF0, the cohort size, median ARF0, fractured count
and the fractured subjects' ARF0 range, the MSF (whole newtons) and how many
subjects had a higher MSF, the strongest MSF in the cohort, and the factor of
risk, fall force / MSF, for both fall forces (2 decimals). The response is
`{"case_id", "facts", "text", "provider", "model", "served", "saved_at",
"fallbacks", "source", "grounding", "logged"}`, with `source` the dataset's citation, DOI and
licence, `grounding` where the table was read from, and `logged` the
[AI audit log](#ai-audit-log-tiger-cloud) row (or null).

`text` comes from the same provider chain, settings and fallback reasons as
`/api/explain`, with its own prompt (2 or 3 sentences) and checker. The
checker accepts a number only when it is a fact or a fact rounded to fewer
decimals, and only as its own kind of quantity: a percent must be an ARF0
value, newtons the MSF or a fall force, "times" a factor of risk, and a count
of women a rank, the fractured count or the cohort size, so the age cannot
become "a 78% risk" nor a rank a fracture risk. "Its ARF0 is ...%" must be
this subject's ARF0. A number with a time unit is allowed only as her age
("78-year-old", "aged 78") or the recorded days to her fracture. It rejects
a rank stated in the wrong direction ("stronger than 75 women" when 75 women
had a stronger femur), spelled-out quantities, time horizons ("next year",
"within", "later", "lifetime", "in her eighties"), "chance", "probability",
"likelihood" and certainty ("will", "going to", "sure to"), diagnosis and
disease names, treatment, drugs, screening, referrals, prevention, advice
and "you". Fracture, risk, break and fall are allowed. A rejected text falls
through to the next provider and finally to a deterministic template built
only from the facts. Every `text` ends with "Published research data, not a
diagnosis or medical advice." An AI answer is kept in memory per case, facts
and chain order (up to 256), so reloading the page does not spend another
model call; a template answer is not kept, so a later request can still get
an AI one.

`tests/test_risk.py` reads the committed `frontend/public/models/hfvalid-risk.json`
(Pat001's facts, a fractured subject, the template for all 101 subjects) and
needs no network.

## Where the AI facts come from (Vultr Object Storage)

Both AI endpoints word facts read from private objects in the Vultr Object
Storage bucket named by `VULTR_S3_BUCKET` (with `VULTR_S3_ENDPOINT`,
`VULTR_S3_ACCESS_KEY` and `VULTR_S3_SECRET_KEY`, from the shell or
`backend/.env`):

| Endpoint | Object | Bundled backup copy |
|---|---|---|
| `POST /api/risk-analysis` | `clinical/hfvalid/hfvalid-risk.json` | `frontend/public/models/hfvalid-risk.json` |
| `POST /api/explain` with `{"case_id": "Pat001"}` | `clinical/hfvalid/pat001-femur-manifest.json` | `frontend/public/models/hfvalid-femur/manifest.json` |

This is de-identified public research data (the HFValid collection, CC BY
4.0), not patient records.
[`scripts/vultr_pipeline/publish_clinical.py`](../scripts/vultr_pipeline/README.md#research-data-for-the-ai-endpoints-clinical)
uploads it, with `clinical/index.json` listing each file's key, sha256, size,
licence, citation and DOI.

`services/clinical_store.py` uses an object only when its sha256, the sha256
the index lists for it, and the sha256 pinned in this repository next to the
bundled copy (`<file>.sha256`, in `sha256sum` format) all agree, so a changed
bucket cannot change the facts without a commit here. Anything else (no
`VULTR_S3_*`, no network, 403 or 404, a mismatch, bad JSON) falls back to the
bundled copy. Each response says which in `grounding`:

```json
{"store": "vultr-object-storage", "key": "clinical/hfvalid/hfvalid-risk.json",
 "sha256": "884f5875...", "verified": true, "reason": null}
{"store": "local-backup", "key": "clinical/hfvalid/hfvalid-risk.json",
 "sha256": "884f5875...", "verified": true,
 "reason": "object storage not configured (VULTR_S3_* not set)"}
```

For the backup, `verified` says whether the bundled copy matches its pin. A
bucket read is kept in memory for 10 minutes and a fallback for 1 minute,
concurrent requests share one read, and each object gets one attempt that gives
up after 1 s to connect or 1.5 s to read, so an outage costs one request about
1.5 s, not every request. A reason names an HTTP status
and error code only, never a key, the endpoint, the bucket name or a URL. The
checkers are unchanged: the facts are the same bytes either way.

With `case_id`, `POST /api/explain` uses the femur model's own numbers, as the
dashboard shows them (`frontend/lib/model.ts`): the nodal-averaged peak stress
`max_nodal_von_mises_mpa` (the top of the 3D colour scale), the load, the
volume, the uniform Young's modulus, and the index from that stress over the
assumed 150 MPa strength. Numbers sent with a `case_id` are not used. An
unknown `case_id` returns 404. Without `case_id` the request's numbers are
used as before and `grounding` is null.

The objects are private (no public URL; read with the bucket's keys) and
travel over HTTPS. Nothing more is claimed about their storage.

## AI audit log (Tiger Cloud)

Every answer `POST /api/risk-analysis` or `POST /api/explain` produces (from a
model or the template) is logged as one row of the `ai_analyses` TimescaleDB
hypertable (`migrations/002_ai_analyses.sql`), in the database `DATABASE_URL`
names (see [Simulation history](#simulation-history-timescaledb)). The same
`python -m services.history migrate` creates it, since it applies every
migration file in order. A row holds the time, an `id`, the endpoint, the
`case_id`, the provider and model, the fallbacks taken before it, the latency,
the grounding store, and the sha256 of the facts and of the text. The text and
the facts themselves are not stored, nor are keys or URLs, and a fallback's
reason is stored without the fragment a rejection quotes (`rejected: blocked
wording`, not the word).

The response's `logged` is `{"id": "<uuid>", "store": "tiger"}` once the row is
written, and null when `DATABASE_URL` is unset or the write fails (logged as a
warning with the password masked; the answer is unaffected). The write is
bounded: 2 s to connect, a 1.5 s statement timeout, 2.5 s in all; after a
failure the log is skipped for 60 s, so a slow database costs one answer that
wait. An answer the API kept and serves again (the answer cache above, keyed
by case, grounding store, facts and chain) is not logged a second time: it
carries the `id` of the row written when it was produced. An answer whose row
was not written is kept for at most 60 s, so a later one is logged.

`GET /api/ai-log?limit=N` (1 to 200, default 20) returns the latest rows,
newest first, without text. It answers 503 when `DATABASE_URL` is unset, the
database is unreachable, or the migration has not been run.

`tests/test_ai_log.py` uses a fake connection, `tests/test_clinical_store.py`
uses moto in place of the bucket, and `tests/test_history_timescale.py` also
applies `002` to its throwaway container and reads a logged row back.

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
  nibabel, numpy, scipy and sfepy, and `segmentation`: `fsl` or `numpy`, the
  tool that made that run's bone mask) and `solve_ms` (wall
  time of that call in the API process, including any wait for an earlier
  solve).
- `simulation_runs_hourly`, a real-time continuous aggregate: per UTC hour, the
  number of runs and the average and maximum of `max_von_mises_stress_mpa`. A
  refresh policy materializes buckets between 30 days and 1 hour old, hourly;
  newer rows are read from the hypertable at query time.
- No retention or compression policy.

### `GET /api/history?limit=N`

`N` is 1–500 (default 10). Response to `?limit=1` from a local TimescaleDB
container after four uploads with curl (`frontend/public/sample_bone.nii.gz` three
times, the femur-shaped volume once), with FSL making the bone mask:

```json
{
  "series": [
    {
      "label": "Oct 18 03:52:11 UTC",
      "value": 17.71
    }
  ],
  "runs": [
    {
      "time": "2026-10-18T03:52:11.625499Z",
      "run_id": "29d93785-16b3-4bc1-82f8-adf8f6325606",
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
        "nibabel": "5.4.2",
        "segmentation": "fsl"
      },
      "solve_ms": 1432.8533750085626
    }
  ],
  "hourly": [
    {
      "bucket": "2026-10-18T03:00:00Z",
      "runs": 4,
      "avg_max_von_mises_stress_mpa": 16.435000000000002,
      "max_max_von_mises_stress_mpa": 17.71
    }
  ]
}
```

- `series` has the shape of `mockStressSeries` in `frontend/lib/mock-data.ts`: one
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
