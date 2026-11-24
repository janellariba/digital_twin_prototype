"""Camera sources. Detection code only sees read() -> frame, so USB webcams can be
replaced by RTSP (Hikvision) later without touching anything else."""
import time

import cv2

BACKENDS = {"dshow": cv2.CAP_DSHOW, "msmf": cv2.CAP_MSMF, "v4l2": cv2.CAP_V4L2, "any": cv2.CAP_ANY}


class CameraSource:
    kind = "base"

    def open(self) -> bool: ...
    def read(self): ...  # -> (ok, frame)
    def close(self): ...
    def describe(self) -> str: ...


class UsbSource(CameraSource):
    kind = "usb"

    def __init__(self, device_index: int, backend="dshow", width=640, height=480, fourcc="MJPG"):
        self.index, self.backend = device_index, backend
        self.width, self.height, self.fourcc = width, height, fourcc
        self.cap = None

    def open(self) -> bool:
        self.close()
        self.cap = cv2.VideoCapture(self.index, BACKENDS.get(self.backend, cv2.CAP_ANY))
        if not self.cap.isOpened():
            return False
        if self.fourcc:
            self.cap.set(cv2.CAP_PROP_FOURCC, cv2.VideoWriter_fourcc(*self.fourcc))
        if self.width:
            self.cap.set(cv2.CAP_PROP_FRAME_WIDTH, self.width)
        if self.height:
            self.cap.set(cv2.CAP_PROP_FRAME_HEIGHT, self.height)
        ok, _ = self.cap.read()
        return ok

    def read(self):
        return self.cap.read() if self.cap is not None else (False, None)

    def close(self):
        if self.cap is not None:
            self.cap.release()
            self.cap = None

    def describe(self):
        return f"USB webcam #{self.index} ({self.backend})"


class FileSource(CameraSource):
    """Plays a video file in a loop at its own frame rate. Useful for repeatable tests."""
    kind = "file"

    def __init__(self, path: str):
        self.path, self.cap, self.delay, self.next_t = path, None, 1 / 15, 0.0

    def open(self) -> bool:
        self.close()
        self.cap = cv2.VideoCapture(self.path)
        fps = self.cap.get(cv2.CAP_PROP_FPS) if self.cap.isOpened() else 0
        self.delay = 1 / fps if fps and fps > 0 else 1 / 15
        return self.cap.isOpened()

    def read(self):
        if self.cap is None:
            return False, None
        wait = self.next_t - time.monotonic()
        if wait > 0:
            time.sleep(wait)
        self.next_t = time.monotonic() + self.delay
        ok, frame = self.cap.read()
        if not ok:  # loop
            self.cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
            ok, frame = self.cap.read()
        return ok, frame

    def close(self):
        if self.cap is not None:
            self.cap.release()
            self.cap = None

    def describe(self):
        return f"Video file {self.path.replace(chr(92), '/').split('/')[-1]}"


def make_source(cfg: dict) -> CameraSource:
    s = cfg["source"]
    if s["type"] == "usb":
        return UsbSource(s["device_index"], s.get("backend", "dshow"), s.get("width"), s.get("height"), s.get("fourcc"))
    if s["type"] == "file":
        return FileSource(s["path"])
    raise ValueError(f"Unsupported source type: {s['type']}")
