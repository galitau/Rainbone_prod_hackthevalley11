# RainbowBone FEA backend

## Run locally

```bash
cd backend
python -m pip install -r requirements.txt
uvicorn main:app --reload
```

The API exposes `GET /health` and `POST /api/simulate`. The simulation endpoint
accepts a multipart form upload named `file` containing a `.nii` or `.nii.gz`
NIfTI volume.

The pipeline thresholds CT Hounsfield Units at 150 HU, maps apparent density
to a 10–25 GPa Young's modulus range, extracts a surface mesh with
`skimage.measure.marching_cubes`, processes it with `trimesh`, applies the
simulated 800 N compressive boundary condition, and returns stress/risk
metrics. The SfePy metadata seam is isolated in `services/fea_solver.py` so a
full volumetric SfePy domain can replace the lightweight mock stress estimate
without changing the API contract.

Example response:

```json
{
  "max_von_mises_stress_mpa": 126.4,
  "average_youngs_modulus_gpa": 17.8,
  "bone_volume_cm3": 184.2,
  "fracture_risk_index_percent": 68.0,
  "load_newtons": 800.0,
  "mesh_vertices": 12480,
  "mesh_faces": 24896,
  "source_filename": "RB-24081-femur.nii.gz"
}
```

## Bone assets from Vultr Object Storage (`GET /api/bones`)

`scripts/vultr_pipeline/pipeline.py` segments CTPelvic1K scans with TotalSegmentator
and uploads bone masks, surface meshes and `ctpelvic1k/manifest.json` to a Vultr
Object Storage bucket as private objects (see `scripts/vultr_pipeline/README.md`).
`GET /api/bones` (`routes_bones.py`) reads that manifest and returns it with the
object `key` (`ctpelvic1k/<path>`), `content_type` and a pre-signed GET URL added to
every file, valid for 15 minutes. The browser downloads the
files straight from the bucket; the keys stay on the server.

### Configuration

The route reads four environment variables from the process environment. Only
the names are documented here and in `scripts/vultr_pipeline/.env.example`; never
commit values.

| Variable | Value |
|---|---|
| `VULTR_S3_ENDPOINT` | Object Storage hostname, e.g. `https://<region>.vultrobjects.com` |
| `VULTR_S3_ACCESS_KEY` | S3 access key |
| `VULTR_S3_SECRET_KEY` | S3 secret key |
| `VULTR_S3_BUCKET` | Bucket the pipeline uploaded to |

```bash
cd backend
( set -a; . /path/outside/repo/vultr-objstore.env; set +a; uvicorn main:app --reload )
```

### Responses

| Status | When |
|---|---|
| 200 | The manifest, with `key`, `content_type` and `url` added to each file and `expires_in_seconds: 900` |
| 503 | A `VULTR_S3_*` variable is unset; `detail` names the missing variables (never their values) |
| 404 | The bucket has no `ctpelvic1k/manifest.json` yet: run the pipeline |
| 502 | The bucket could not be read, or the manifest is not valid JSON |

Abridged 200 response (placeholder values):

```json
{
  "expires_in_seconds": 900,
  "expires_at": "<UTC time>",
  "manifest_key": "ctpelvic1k/manifest.json",
  "generated_utc": "<UTC time>",
  "dataset": {"name": "CTPelvic1K (sub-dataset 6, CLINIC)", "license": "cc-by-4.0", "doi": "10.5281/zenodo.4588403", "...": "..."},
  "segmentation_tool": {"name": "TotalSegmentator", "version": "2.18.0", "license": "Apache-2.0 (...)", "citation": "..."},
  "mesh_method": "vtkFlyingEdges3D at 0.5 on the binary mask ...",
  "cases": [
    {
      "case_id": "<case>",
      "bones": [{"name": "sacrum", "source_ts_classes": ["sacrum", "vertebrae_S1"], "volume_ml": 0, "...": "..."}],
      "validation": {"dice_overlap_matched": {"sacrum_incl_S1": 0, "hip_left": 0, "hip_right": 0}, "...": "..."},
      "files": [
        {"path": "<case>/meshes/sacrum.vtp", "kind": "mesh", "bone": "sacrum",
         "format": "VTK XML PolyData, binary zlib, float32 points, RAS world mm",
         "bytes": 0, "sha256": "<hex>", "triangles": 0, "bounds_ras_mm": [0, 0, 0, 0, 0, 0],
         "key": "ctpelvic1k/<case>/meshes/sacrum.vtp", "content_type": "application/xml",
         "url": "https://<region>.vultrobjects.com/<bucket>/ctpelvic1k/<case>/meshes/sacrum.vtp?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Expires=900&..."}
      ]
    }
  ]
}
```

Only relative `path` values without `..` are signed, so every signed key is under
`ctpelvic1k/`. A SigV4 pre-signed URL carries the
access key ID in `X-Amz-Credential` (that is how S3 identifies the signer); the
secret key is never sent. The route logs only S3 error codes. For the browser to
fetch the URLs, the bucket needs a CORS rule for the front end's origin
(`pipeline.py --cors-origin <origin>`).

### Tests

No network or bucket: moto stands in for Object Storage.

```bash
cd backend
python -m pip install -r requirements.txt python-multipart httpx "moto[s3]"
python -m unittest tests.test_bones -v
```
