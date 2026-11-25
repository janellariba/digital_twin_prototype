// One camera card: live preview (refreshed by polling the latest JPEG), status
// badge, source and speed. Boxes are drawn on the image by the camera node.
import { useEffect, useState } from "react";

const PREVIEW_REFRESH_MS = 500; // display only: how often the card asks for a new image

const STATE_STYLE = {
  ONLINE: "border-emerald-500 text-emerald-300",
  OFFLINE: "border-slate-500 text-slate-400",
  ERROR: "border-red-500 text-red-400",
};

export default function CameraFeed({ cam }) {
  const [tick, setTick] = useState(0);
  const [imgOk, setImgOk] = useState(false);
  const live = cam.state !== "OFFLINE";

  useEffect(() => {
    if (!live) return;
    const t = setInterval(() => setTick((n) => n + 1), PREVIEW_REFRESH_MS);
    return () => clearInterval(t);
  }, [live]);

  const state = cam.detecting ? "DETECTING" : cam.state;
  const badge = cam.detecting ? "border-red-500 bg-red-500/20 text-red-300 animate-pulse" : STATE_STYLE[cam.state];

  return (
    <div className={`flex min-w-0 flex-col overflow-hidden rounded-xl border bg-panel2 ${cam.detecting ? "border-fire" : "border-line"}`}>
      <div className="flex items-center justify-between gap-2 px-3 py-1.5">
        <div className="min-w-0 truncate text-sm">
          <span className="font-semibold">{cam.id}</span> <span className="text-muted">{cam.label}</span>
        </div>
        <span className={`shrink-0 rounded-full border px-2 py-0.5 font-mono text-[10px] ${badge}`}>{state}</span>
      </div>

      <div className="relative aspect-[4/3] w-full bg-black">
        {live && (
          <img
            src={`/api/cameras/${encodeURIComponent(cam.id)}/frame.jpg?t=${tick}`}
            alt={`${cam.id} live preview`}
            className={`h-full w-full object-contain ${imgOk ? "" : "invisible"}`}
            onLoad={() => setImgOk(true)}
            onError={() => setImgOk(false)}
          />
        )}
        {(!live || !imgOk) && (
          <div className="absolute inset-0 flex items-center justify-center p-3 text-center text-xs text-muted">
            {cam.state === "OFFLINE"
              ? `Offline${cam.seconds_since_seen != null ? `, last seen ${Math.round(cam.seconds_since_seen)} s ago` : ""}`
              : cam.state === "ERROR" ? cam.message || "Camera error" : "Waiting for image..."}
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-x-3 px-3 py-1.5 font-mono text-[11px] text-muted">
        <span className="truncate" title={cam.source}>{cam.source || "-"}</span>
        <span className="text-right">{cam.device || "-"}</span>
        <span>cam {cam.capture_fps ?? "-"} fps</span>
        <span className="text-right">AI {cam.inference_fps ?? "-"} fps · {cam.inference_ms ?? "-"} ms</span>
      </div>
    </div>
  );
}
