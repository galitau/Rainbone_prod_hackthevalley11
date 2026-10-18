# ChromaBone Tech Stack & Rules
- **Frontend**: Next.js (App Router), Tailwind CSS, Shadcn UI.
- **3D Rendering**: vtk.js (strictly for in-browser NIfTI/DICOM volume rendering). Do not fall back to Three.js.
- **Backend**: Python, FastAPI, FEniCS/SfePy for FEA physics simulations.
- **Database**: PostgreSQL (Tiger Data schema) for time-series wearable metrics.
- **Strict Rule**: Never use Streamlit or basic Python dash tools. All UI must be professional Next.js React components.