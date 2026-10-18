"""Generate and upload cached lesion progression VTP frames to Vultr Object Storage."""
from __future__ import annotations

import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from services.progression_mesh import progression_vtp
from services.storage import write_object_bytes


def main() -> None:
    for frame_index in range(8):
        filename = f"progression/frame-{frame_index:02d}.vtp"
        payload = progression_vtp(frame_index)
        write_object_bytes(filename, payload, "application/xml")
        print(f"uploaded {filename} ({len(payload):,} bytes)")


if __name__ == "__main__":
    main()
