# Pelvic bones from CTPelvic1K to Vultr Object Storage

`pipeline.py` moves bone assets out of `public/` and into a Vultr Object Storage
bucket (S3-compatible). For each CT case it:

1. Looks up the file URLs, sizes and MD5 checksums in the Zenodo API
   (`https://zenodo.org/api/records/4588403`), so nothing is hard-coded.
2. Streams `CTPelvic1K_dataset6_data.tar.gz` (8,811,634,327 bytes) and extracts
   only the first `--cases N` `.nii.gz` scans, then stops reading. It also downloads
   the whole `CTPelvic1K_dataset6_Anonymized_mask.tar.gz` (21,918,797 bytes),
   checks its MD5, and keeps the dataset's own annotation for the same cases.
3. Runs the TotalSegmentator CLI with `--roi_subset sacrum vertebrae_S1 hip_left
   hip_right femur_left femur_right vertebrae_L5` (class names of TotalSegmentator
   2.18.0's `total` task) and `--report`, plus `--fast` and `--device` when given.
4. Writes `processed/`: every TotalSegmentator mask (`.nii.gz`, unmodified), one
   watertight surface mesh per bone (`.vtp`, the format the viewer's vtk.js
   `XMLPolyDataReader` reads), Dice scores against the dataset's own annotation, and
   `manifest.json`. The sacrum mesh is TotalSegmentator's `sacrum` plus
   `vertebrae_S1`, because TotalSegmentator labels S1 separately: against the
   CTPelvic1K sacrum label that raised Dice from 0.81-0.83 to 0.91-0.94 on cases
   0012, 0023 and 0060.
5. Uploads `processed/` under `ctpelvic1k/` as **private** objects with boto3, with
   the right content type and the file's sha256 in the object metadata. Unchanged
   objects are skipped. `manifest.json` is uploaded last.

`--from-processed <dir>` skips steps 1-4 and uploads a `processed/` folder made
earlier (by this script or by the same steps run by hand), after checking every
file against the manifest.

The backend then serves `GET /api/bones` (see `backend/README.md`): it reads the
manifest from the bucket and returns 15-minute pre-signed GET URLs, so the
browser downloads the files directly from Vultr without any credentials.

## Data and licences

| Source | Licence | Cite |
|---|---|---|
| **CTPelvic1K**, Zenodo record [4588403](https://zenodo.org/records/4588403), DOI [10.5281/zenodo.4588403](https://doi.org/10.5281/zenodo.4588403). Code and details: [MIRACLE-Center/CTPelvic1K](https://github.com/MIRACLE-Center/CTPelvic1K) | CC BY 4.0 | Pengbo Liu, Hu Han, Yuanqi Du, Heqin Zhu, Yinhao Li, Feng Gu, Honghu Xiao, Jun Li, Chunpeng Zhao, Li Xiao, Xinbao Wu, S. Kevin Zhou. Deep Learning to Segment Pelvic Bones: Large-scale CT Datasets and Baseline Models. International Journal of Computer Assisted Radiology and Surgery (IJCARS) pp. 1-8 (2021). Preprint arXiv:2012.08721 |
| **TotalSegmentator** 2.18.0, [wasserth/TotalSegmentator](https://github.com/wasserth/TotalSegmentator) | Apache-2.0 (the code and the default `total` task used here) | Wasserthal J. et al. TotalSegmentator: Robust Segmentation of 104 Anatomic Structures in CT Images. Radiology: Artificial Intelligence, 2023. DOI [10.1148/ryai.230024](https://doi.org/10.1148/ryai.230024). Also cite [nnU-Net](https://github.com/MIC-DKFZ/nnUNet) |

The manifest carries the dataset's licence, DOI, creators and reference as the
Zenodo API returns them, and the TotalSegmentator citation.

CTPelvic1K is a pelvic bone segmentation dataset. Dataset 6 (CLINIC) is described
by its authors as preoperative pelvic-fracture CT without metal artefacts. The
masks here are automatic segmentations, not reviewed by a clinician: research
data, not for clinical use.

## Install

TotalSegmentator brings PyTorch, so give it its own virtual environment if you
like and point `--totalseg-bin` at its executable.

macOS / Linux:

```bash
python3.12 -m venv .venv
. .venv/bin/activate
python -m pip install -r scripts/vultr_pipeline/requirements.txt
python -m pip install TotalSegmentator==2.18.0
```

Windows (PowerShell):

```powershell
py -3.12 -m venv .venv
.venv\Scripts\Activate.ps1
python -m pip install -r scripts/vultr_pipeline/requirements.txt
python -m pip install TotalSegmentator==2.18.0
```

TotalSegmentator keeps its weights in `~/.totalsegmentator` and downloads them
when missing (set `TOTALSEG_HOME_DIR` to use another folder).

## Configure

The upload reads exactly four environment variables. Their names are in
`.env.example` in this folder. Keys never go in code or in the repository.

| Variable | Value |
|---|---|
| `VULTR_S3_ENDPOINT` | Hostname of the Object Storage subscription, e.g. `https://<region>.vultrobjects.com` (`https://` is added when missing) |
| `VULTR_S3_ACCESS_KEY` | S3 access key |
| `VULTR_S3_SECRET_KEY` | S3 secret key |
| `VULTR_S3_BUCKET` | Bucket name |

If any is missing, the pipeline stops before downloading anything and names the
missing variables (exit code 2). `--skip-upload` and `--dry-run` need none of them.

For a `*.vultrobjects.com` endpoint the signing region is the first label of the
hostname (e.g. `ewr1`), as in Vultr's boto3 guide; other endpoints (such as a
local S3 emulator) use `us-east-1`.

Load the values only into the command that needs them, e.g. from a private file
outside the repository:

```bash
( set -a; . /path/outside/repo/vultr-objstore.env; set +a
  python scripts/vultr_pipeline/pipeline.py --work-dir /data/ctpelvic1k --cases 2 )
```

```powershell
Get-Content C:\secure\vultr-objstore.env | ForEach-Object {
  if ($_ -match '^(VULTR_S3_\w+)=(.*)$') { Set-Item "env:$($matches[1])" $matches[2] } }
python scripts/vultr_pipeline/pipeline.py --work-dir D:\data\ctpelvic1k --cases 2
```

## Run

```bash
# Plan only: resolves the Zenodo files and prints the TotalSegmentator command.
python scripts/vultr_pipeline/pipeline.py --work-dir /data/ctpelvic1k --cases 2 --dry-run

# Two cases, Apple-silicon GPU, no upload.
python scripts/vultr_pipeline/pipeline.py --work-dir /data/ctpelvic1k --cases 2 --device mps --skip-upload

# Upload too, and allow the front end's origin to GET the pre-signed URLs.
python scripts/vultr_pipeline/pipeline.py --work-dir /data/ctpelvic1k --cases 2 --device mps \
  --cors-origin http://localhost:3000

# Upload a processed/ folder that already exists (no Zenodo, no TotalSegmentator).
python scripts/vultr_pipeline/pipeline.py --from-processed /data/ctpelvic1k/processed \
  --cors-origin http://localhost:3000
```

| Option | Default | Meaning |
|---|---|---|
| `--work-dir` | one of these two | Downloads, scans, masks and meshes. Refused if inside the repository |
| `--from-processed` | one of these two | Upload an existing `processed/` folder: every file `manifest.json` lists must be there with the listed bytes and sha256, under a relative path, and the manifest must hold no local path. Refused if inside the repository |
| `--record` | `4588403` | Zenodo record |
| `--data-file` | `CTPelvic1K_dataset6_data.tar.gz` | CT tarball in the record. Only dataset 6 has been run |
| `--mask-file` | `CTPelvic1K_dataset6_Anonymized_mask.tar.gz` | Reference annotations, matched to scans by case id (`<case>_data` / `<case>_mask_*`); `''` to skip |
| `--cases` | `1` | Number of cases taken from the start of the tarball |
| `--bones` | `sacrum hip_left hip_right femur_left femur_right vertebrae_L5` | Bones to mesh. `sacrum` is TotalSegmentator's `sacrum` + `vertebrae_S1`; any other TotalSegmentator class name (list them with `TotalSegmentator --list-classes`) is meshed on its own. `--roi_subset` is the union of their classes |
| `--device` | TotalSegmentator's (`gpu`) | `gpu`, `cpu`, `mps` or `gpu:N`. Without CUDA, TotalSegmentator falls back to CPU; on Apple silicon use `mps` |
| `--fast` | off | TotalSegmentator's 3 mm model |
| `--verify-archive` | off | Read the whole CT tarball to check its MD5 (downloads all 8.8 GB) |
| `--include-ct` | off | Also upload each source CT volume |
| `--cors-origin` | none | Replace the bucket's CORS rules with GET/HEAD from these origins (repeatable) |
| `--totalseg-bin` | `TotalSegmentator` on `PATH` | TotalSegmentator executable |
| `--dry-run` | off | No downloads, segmentation or uploads (with `--from-processed`: check the folder only) |
| `--skip-upload` | off | Everything except the upload |

## Outputs

```
<work-dir>/
  raw/ct/<case>_data.nii.gz, index.json        extracted scans (never uploaded unless --include-ct)
  raw/reference/<case>_mask_4label.nii.gz       CTPelvic1K annotation (used for Dice, not uploaded)
  downloads/CTPelvic1K_dataset6_Anonymized_mask.tar.gz
  segment/<case>/<class>.nii.gz, segmentation.json   TotalSegmentator output
  segment/<case>.report.json                    TotalSegmentator --report (versions, device, runtime)
  cases/<case>.json                             one manifest entry per case
  processed/                                    exactly what is uploaded, under ctpelvic1k/
    manifest.json
    <case>/masks/<class>.nii.gz
    <case>/meshes/<bone>.vtp
    <case>/ct/<file>.nii.gz                     --include-ct only
```

Each file in `manifest.json` has a `path` relative to the manifest; its object key
is `ctpelvic1k/<path>`. Content types: `.nii.gz` `application/gzip`, `.vtp`
`application/xml`, `.json` `application/json`.

`manifest.json`:

| Field | Content |
|---|---|
| `generated_utc` | Time stamp |
| `dataset` | Name, Zenodo record, DOI, licence, creators and citation (from the Zenodo API), preprint, repository, the CTPelvic1K label map and its source file, the source archives (bytes, MD5, URL) and how they were read |
| `segmentation_tool` | TotalSegmentator version, licence, citation, nnU-Net citation, repository, "not a medical device" disclaimer |
| `mesh_method` | How meshes are made, with the VTK version |
| `cases[].source_file` | Archive member, bytes, sha256, shape, spacing, orientation of the CT |
| `cases[].expert_mask_file` | The CTPelvic1K annotation used for Dice, with its label volumes in mL |
| `cases[].bones` | Per bone: source TotalSegmentator classes, voxels, volume (mL), connected components, whether it touches the top or bottom slice of the scan (cut off), mesh volume |
| `cases[].files` | Masks (`kind: mask`, `ts_class`) and meshes (`kind: mesh`, `bone`) with `path`, `format`, `bytes`, `sha256`; meshes also carry points, triangles, decimation, watertight check, bounds (RAS mm), surface area and enclosed volume |
| `cases[].segmentation` | TotalSegmentator, nnU-Net and PyTorch versions, task, classes, `--fast`, device, wall time and TotalSegmentator's own runtime |
| `cases[].validation` | Dice against the annotation (see below), hip centroids, and what was not compared |

Meshes: `vtkFlyingEdges3D` at 0.5 on the binary mask (zero-padded, so bones cut off
by the scan are still closed), transformed by the NIfTI affine to RAS world
millimetres, windowed-sinc smoothing, then decimation to a per-bone triangle budget.
A mesh is kept only if it has no boundary or non-manifold edges and its triangles
face outward; otherwise the next step of the ladder is tried (topology-preserving
`vtkDecimatePro`, then 1.5x, 2x and 3x the budget), and the run fails if none passes.
Files are VTK XML PolyData, binary with zlib compression. A bone with no voxels gets
no mesh; its `bones` entry shows `voxels: 0`.

Dice: CTPelvic1K labels 1 sacrum, 2 right_hip, 3 left_hip, 4 lumbar_vertebra
(`nnunet/dataset_conversion/JstPelvisSegmentation_5label.py` in the CTPelvic1K
repository). On the dataset 6 cases checked, label 2 ("right_hip") lies where
TotalSegmentator's `hip_left` is, so matched by name the hip Dice is 0.0. The
manifest therefore also scores each hip against the opposite label, sets
`expert_lr_names_swapped_vs_totalsegmentator`, and keeps the pairing that overlaps
in `dice_overlap_matched`. Femurs have no CTPelvic1K label, and label 4 is the
lumbar spine in view rather than L5 alone, so the L5 Dice is informational only.

## Integrity and re-runs

- The mask tarball is downloaded whole and checked against Zenodo's size and MD5.
- The CT tarball's MD5 covers the whole 8.8 GB file, so it can only be checked when
  the whole file is read (`--verify-archive`, or an archive with fewer than
  `--cases` scans). Otherwise `archive_md5_verified` is `false` in the manifest.
  Every extracted scan is still checked against its tar header size and its own
  gzip CRC-32, and its sha256 is recorded.
- A mismatch deletes what was extracted and exits with code 1.
- Re-runs reuse extracted scans (`raw/ct/index.json`) and TotalSegmentator output
  made with the same classes, `--fast` and TotalSegmentator version. Uploads skip
  every object whose stored sha256 metadata matches; `manifest.json` changes on
  each run (time stamp) and is uploaded again.
- Before any upload, every file the manifest lists is checked against its bytes and
  sha256, its path must be relative with no `..`, and the manifest must not contain
  the folder's own path or the home directory. Any failure uploads nothing.

## Tests

No network, no bucket and no TotalSegmentator needed: Zenodo is a mocked
`urlopen`, S3 is [moto](https://github.com/getmoto/moto), and TotalSegmentator is
a fake executable placed first on `PATH`.

```bash
python -m pip install -r scripts/vultr_pipeline/requirements.txt "moto[s3]"
python -m unittest discover -s scripts/vultr_pipeline -p "test_*.py" -v
```

## Windows notes

- Paths are handled with `pathlib`, so `--work-dir D:\data\ctpelvic1k` works.
  Keep it short if Windows long paths are disabled.
- `pip install TotalSegmentator` puts `TotalSegmentator.exe` in `.venv\Scripts`,
  which is on `PATH` once the environment is activated; otherwise pass
  `--totalseg-bin .venv\Scripts\TotalSegmentator.exe`.
- With an NVIDIA GPU and a CUDA build of PyTorch use `--device gpu`; otherwise
  `--device cpu` (add `--fast` to shorten the run).
- The test suite writes a `TotalSegmentator.bat` shim instead of a shell script.
