"""The node's main loop.

    capture thread : reads frames as fast as the camera gives them, reconnects on failure
    main loop      : runs YOLO on the newest frame (at most inference_fps), sends events
                     and preview images, sends heartbeats

A camera or model error only affects this process. Other camera nodes keep running.
"""
from __future__ import annotations

import logging
import socket
import threading
import time
import uuid
from datetime import datetime, timezone

from .detector import Detector, annotate, to_jpeg
from .sources import make_source
from .uplink import Uplink

log = logging.getLogger("node")
SOFTWARE_VERSION = "0.3.0"


class CaptureThread(threading.Thread):
    def __init__(self, source):
        super().__init__(daemon=True)
        self.source = source
        self.lock = threading.Lock()
        self.frame, self.frame_ts, self.seq = None, 0.0, 0
        self.status, self.message = "starting", "Opening camera"
        self.fps = 0.0
        self.stop_event = threading.Event()

    def run(self):
        delay = 1.0
        while not self.stop_event.is_set():
            if not self.source.open():
                self.status, self.message = "camera_error", f"Cannot open {self.source.describe()}"
                log.warning("%s. Retrying in %.0f s.", self.message, delay)
                self.stop_event.wait(delay)
                delay = min(delay * 2, 10.0)  # back off up to 10 s
                continue
            log.info("Camera opened: %s", self.source.describe())
            self.status, self.message, delay = "ok", "", 1.0
            count, t0, fails = 0, time.monotonic(), 0
            while not self.stop_event.is_set():
                ok, frame = self.source.read()
                if not ok or frame is None:
                    fails += 1
                    if fails >= 10:  # unplugged or stalled
                        self.status, self.message = "camera_error", "Camera stopped sending frames"
                        log.warning("%s. Reconnecting.", self.message)
                        break
                    time.sleep(0.05)
                    continue
                fails = 0
                with self.lock:
                    self.frame, self.frame_ts = frame, time.time()
                    self.seq += 1
                count += 1
                if time.monotonic() - t0 >= 2.0:
                    self.fps = count / (time.monotonic() - t0)
                    count, t0 = 0, time.monotonic()
            self.source.close()
        self.source.close()

    def latest(self):
        with self.lock:
            return self.frame, self.frame_ts, self.seq


def run(cfg: dict):
    det_cfg = cfg["detection"]
    cam_id = cfg["camera_id"]
    up = Uplink(cfg["server_url"], cam_id, cfg["api_key"])
    detector = Detector(det_cfg["model_path"], det_cfg.get("device", "auto"), det_cfg["conf_threshold"], det_cfg.get("imgsz"))
    source = make_source(cfg)
    cap = CaptureThread(source)
    cap.start()

    reg_info = {
        "node_id": socket.gethostname()[:40],
        "label": str(cfg.get("label", cam_id))[:60],
        "site": str(cfg.get("site", ""))[:20],
        "source": source.describe(),
        "source_type": source.kind,
        "model_name": detector.model_name,
        "classes": list(detector.names.values()),
        "device": detector.device,
        "software_version": SOFTWARE_VERSION,
    }
    registered = up.register(reg_info)

    infer_period = 1.0 / det_cfg["inference_fps"]
    preview_period = 1.0 / det_cfg["preview_fps"]
    hb_period = det_cfg["heartbeat_interval_s"]
    min_gap = det_cfg["event_min_interval_s"]
    last_infer = last_preview = last_hb = last_event = 0.0
    last_seq, last_dets, infer_ms = -1, [], 0.0
    infer_status, infer_msg, infer_count, infer_t0, infer_fps = "ok", "", 0, time.monotonic(), 0.0

    log.info("Node %s running. Press Ctrl+C to stop.", cam_id)
    try:
        while True:
            now = time.monotonic()
            frame, frame_ts, seq = cap.latest()

            # 1) YOLO on the newest frame
            if frame is not None and seq != last_seq and now - last_infer >= infer_period:
                last_infer, last_seq = now, seq
                try:
                    last_dets, infer_ms = detector(frame)
                    infer_status, infer_msg = "ok", ""
                    infer_count += 1
                except Exception as e:  # keep running; report the problem
                    infer_status, infer_msg, last_dets = "inference_error", str(e)[:200], []
                    log.exception("Inference failed")
                if now - infer_t0 >= 2.0:
                    infer_fps, infer_count, infer_t0 = infer_count / (now - infer_t0), 0, now

                # 2) Detection event (rate limited while the fire stays visible)
                if last_dets and now - last_event >= min_gap:
                    last_event = now
                    h, w = frame.shape[:2]
                    event = {
                        "event_id": str(uuid.uuid4()),
                        "camera_id": cam_id,
                        "source_type": "ai",
                        "captured_at": datetime.fromtimestamp(frame_ts, timezone.utc).isoformat(),
                        "frame_width": w, "frame_height": h,
                        "model_name": detector.model_name,
                        "conf_threshold": det_cfg["conf_threshold"],
                        "pan_deg": None,  # fixed webcam; PTZ cameras will report this
                        "detections": last_dets,
                    }
                    snap = to_jpeg(annotate(frame, last_dets, cam_id), w, 85)
                    up.detection(event, snap)
                    log.info("Detection: %s", ", ".join(f"{d['class_name']} {d['confidence']:.2f}" for d in last_dets))

            # 3) Live preview for the dashboard
            if frame is not None and now - last_preview >= preview_period:
                last_preview = now
                up.frame(to_jpeg(annotate(frame, last_dets, cam_id), det_cfg["preview_width"], det_cfg["jpeg_quality"]))

            # 4) Heartbeat (and re-register if the server was down at start)
            if now - last_hb >= hb_period:
                last_hb = now
                if not registered:
                    registered = up.register(reg_info)
                status = cap.status if cap.status != "ok" else infer_status
                h, w = (frame.shape[:2] if frame is not None else (None, None))
                up.heartbeat({
                    "status": status,
                    "message": cap.message or infer_msg,
                    "capture_fps": round(cap.fps, 1),
                    "inference_fps": round(infer_fps, 1),
                    "inference_ms": round(infer_ms, 1),
                    "frame_width": w, "frame_height": h,
                    "detecting": bool(last_dets),
                    "queued_events": len(up.pending),
                })
                up.flush()

            time.sleep(0.01)
    except KeyboardInterrupt:
        log.info("Stopping %s", cam_id)
    finally:
        cap.stop_event.set()
        cap.join(timeout=3)
        up.close()
