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
