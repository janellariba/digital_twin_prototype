"""Talks to the central server over HTTP. Never touches the database directly.

If the server is unreachable, detection events wait in a small queue and are
sent when it comes back (each has a unique event_id, so resending is safe).
"""
import base64
import logging
from collections import deque

import httpx

log = logging.getLogger("node.uplink")


class Uplink:
    def __init__(self, server_url: str, camera_id: str, api_key: str, queue_size: int = 200):
        self.base = server_url.rstrip("/")
        self.camera_id = camera_id
        self.client = httpx.Client(timeout=httpx.Timeout(4.0, connect=2.0), headers={"X-Node-Key": api_key})
        self.pending: deque = deque(maxlen=queue_size)
        self.online = None  # unknown until first call

    def _call(self, method, path, **kw):
        try:
            r = self.client.request(method, self.base + path, **kw)
        except httpx.HTTPError as e:
            if self.online is not False:
                log.warning("Server unreachable (%s). Will keep retrying.", type(e).__name__)
            self.online = False
            return None
        if self.online is False:
            log.info("Server reachable again.")
        self.online = True
        if r.status_code == 401:
            log.error("Server rejected the node key (401). NODE_API_KEY must match server/.env.")
        elif r.status_code >= 400:
            log.warning("%s %s -> HTTP %s: %s", method, path, r.status_code, r.text[:200])
        return r

    def register(self, info: dict) -> bool:
        r = self._call("POST", "/api/nodes/register", json={"camera_id": self.camera_id, **info})
        return r is not None and r.status_code == 200

    def heartbeat(self, status: dict) -> bool:
        r = self._call("POST", f"/api/nodes/{self.camera_id}/heartbeat", json=status)
        return r is not None and r.status_code == 200

    def frame(self, jpeg: bytes) -> None:
        self._call("PUT", f"/api/nodes/{self.camera_id}/frame", content=jpeg, headers={"Content-Type": "image/jpeg"})

    def detection(self, event: dict, snapshot_jpeg: bytes) -> None:
        payload = {**event, "snapshot_jpeg_b64": base64.b64encode(snapshot_jpeg).decode()}
        self.pending.append(payload)
        self.flush()

    def flush(self) -> None:
        while self.pending:
            r = self._call("POST", "/api/detections", json=self.pending[0])
            if r is None or r.status_code >= 500:
                return  # try again later
            self.pending.popleft()  # sent, or rejected for a reason resending won't fix

    def close(self):
        self.client.close()
