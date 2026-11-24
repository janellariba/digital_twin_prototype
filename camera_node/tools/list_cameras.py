"""Find which device index each webcam has.

Tries indexes 0..N, prints what opens, and saves one snapshot per camera to
camera_node/captures/ so you can SEE which physical webcam is which.

    python tools/list_cameras.py            (Windows, DirectShow)
    python tools/list_cameras.py --max 8 --backend msmf
"""
import argparse
from pathlib import Path

import cv2

BACKENDS = {"dshow": cv2.CAP_DSHOW, "msmf": cv2.CAP_MSMF, "v4l2": cv2.CAP_V4L2, "any": cv2.CAP_ANY}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--max", type=int, default=6, help="highest index to try (default 6)")
    ap.add_argument("--backend", default="dshow", choices=BACKENDS)
    args = ap.parse_args()
    out = Path(__file__).resolve().parent.parent / "captures"
    out.mkdir(exist_ok=True)

    found = 0
    for i in range(args.max + 1):
        cap = cv2.VideoCapture(i, BACKENDS[args.backend])
        if not cap.isOpened():
            print(f"index {i}: nothing")
            continue
        cap.set(cv2.CAP_PROP_FOURCC, cv2.VideoWriter_fourcc(*"MJPG"))
        for _ in range(5):  # let auto exposure settle
            ok, frame = cap.read()
        if ok and frame is not None:
            h, w = frame.shape[:2]
            path = out / f"camera_index_{i}.jpg"
            cv2.imwrite(str(path), frame)
            print(f"index {i}: OK  {w}x{h}  snapshot -> {path}")
            found += 1
        else:
            print(f"index {i}: opens but gives no image")
        cap.release()
    print(f"\n{found} camera(s) found. Open the snapshots to see which webcam is which,")
    print("then set source.device_index in config/LAB-A.json, LAB-B.json, LAB-C.json.")
    print("Note: the built-in laptop camera usually appears as index 0.")


if __name__ == "__main__":
    main()
