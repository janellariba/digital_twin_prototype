"""YOLO wrapper. Works with detection and segmentation models (uses the boxes)."""
from __future__ import annotations
import logging
import time

import cv2

log = logging.getLogger("node.detector")

COLORS = {"fire": (40, 90, 255), "smoke": (200, 200, 200)}  # BGR, display only


class Detector:
    def __init__(self, model_path: str, device: str = "auto", conf: float = 0.5, imgsz: int | None = None):
        import torch
        from ultralytics import YOLO

        if device == "auto":
            device = "cuda:0" if torch.cuda.is_available() else "cpu"
        self.device = device
        self.model = YOLO(model_path)
        self.names = {int(k): str(v) for k, v in self.model.names.items()}
        self.imgsz = imgsz or self.model.overrides.get("imgsz") or 640
        self.conf = conf
        self.model_name = model_path.replace("\\", "/").split("/")[-1]
        log.info("Model %s (%s) on %s, classes %s, imgsz %s", self.model_name, self.model.task, device, self.names, self.imgsz)
        if device == "cpu":
            log.warning("Running YOLO on CPU. Install the CUDA build of PyTorch to use the GPU (see README).")

    def __call__(self, frame):
        """Returns (detections, inference_ms). Each detection is a plain dict."""
        t = time.perf_counter()
        r = self.model.predict(frame, conf=self.conf, imgsz=self.imgsz, device=self.device, verbose=False)[0]
        ms = (time.perf_counter() - t) * 1000
        dets = []
        for box in r.boxes:
            x1, y1, x2, y2 = (float(v) for v in box.xyxy[0].tolist())
            cid = int(box.cls[0])
            dets.append({
                "class_id": cid,
                "class_name": self.names.get(cid, str(cid)),
                "confidence": round(float(box.conf[0]), 4),
                "bbox_xyxy": [round(x1, 1), round(y1, 1), round(x2, 1), round(y2, 1)],
                "center_x": round((x1 + x2) / 2, 1),
                "center_y": round((y1 + y2) / 2, 1),
            })
        return dets, ms


def annotate(frame, dets, camera_id: str):
    """Draw boxes, labels and a timestamp on a copy of the frame (for preview and snapshots)."""
    img = frame.copy()
    for d in dets:
        x1, y1, x2, y2 = (int(v) for v in d["bbox_xyxy"])
        c = COLORS.get(d["class_name"], (0, 255, 255))
        cv2.rectangle(img, (x1, y1), (x2, y2), c, 2)
        label = f"{d['class_name']} {d['confidence']:.2f}"
        (tw, th), _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.55, 1)
        cv2.rectangle(img, (x1, max(0, y1 - th - 8)), (x1 + tw + 6, y1), c, -1)
        cv2.putText(img, label, (x1 + 3, y1 - 5), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (0, 0, 0), 1, cv2.LINE_AA)
    stamp = f"{camera_id}  {time.strftime('%Y-%m-%d %H:%M:%S')}"
    cv2.putText(img, stamp, (8, img.shape[0] - 10), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 0, 0), 3, cv2.LINE_AA)
    cv2.putText(img, stamp, (8, img.shape[0] - 10), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 255), 1, cv2.LINE_AA)
    return img


def to_jpeg(img, width: int, quality: int) -> bytes:
    h, w = img.shape[:2]
    if w > width:
        img = cv2.resize(img, (width, int(h * width / w)), interpolation=cv2.INTER_AREA)
    ok, buf = cv2.imencode(".jpg", img, [cv2.IMWRITE_JPEG_QUALITY, int(quality)])
    return buf.tobytes() if ok else b""
