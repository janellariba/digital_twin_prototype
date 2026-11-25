// LIVE: the selected camera's footage and facts.
//   Live            the node's latest preview JPEG, refreshed (boxes drawn by the node)
//   Last detection  snapshot saved with this camera's most recent detection
//   Snapshots       the last few detection snapshots
import { useEffect, useRef, useState } from "react";
import LiveThumb from "./LiveThumb.jsx";
import { camState, StateBadge } from "../services/status.jsx";

const LIVE_REFRESH_MS = 400; // display only
const fmtTime = (iso) => (iso ? new Date(iso).toLocaleTimeString() : "-");

function Fact({ k, children }) {
  return (
    <div className="rounded-lg border border-[#1b2430] bg-panel2 px-2.5 py-2">
      <div className="text-[10.5px] font-bold uppercase tracking-[0.1em] text-muted">{k}</div>
      <div className="mt-0.5 text-[13px]">{children}</div>
    </div>
  );
}
const NotMeasured = () => <StateBadge state="nolink">NOT MEASURED</StateBadge>;

export default function CameraViewer({ cam, tower, detections, onShowOnTwin, onClose }) {
  const [mode, setMode] = useState("live");
  const [tick, setTick] = useState(0);
  const [ok, setOk] = useState(false);
  const boxRef = useRef(null);
  const st = cam ? camState(cam) : "offline";
  const live = cam && cam.state !== "OFFLINE";
  const mine = cam ? detections.filter((d) => d.camera_id === cam.id) : [];
  const last = mine[0];

  useEffect(() => { setOk(false); }, [cam?.id]);
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose?.(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  useEffect(() => {
    if (!live || mode !== "live") return;
    const t = setInterval(() => setTick((n) => n + 1), LIVE_REFRESH_MS);
    return () => clearInterval(t);
  }, [live, mode]);

  if (!cam) {
    return (
      <section className="card text-sm text-muted">
        No camera selected. Start a camera node, then click it in the Watchtowers list.
      </section>
    );
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
    <section role="dialog" aria-modal="true" aria-label={`${cam.id} camera view`} onClick={(e) => e.stopPropagation()}
      className="card max-h-[94vh] w-full max-w-5xl overflow-y-auto shadow-2xl">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2.5">
          <h2 className="h-label">Camera view</h2>
          <b>{cam.id}</b>
          <span className="text-[12px] text-muted">{tower ? `on ${tower.id} ${tower.name}` : "not linked to a tower"}</span>
          <StateBadge state={st} />
        </div>
        <div className="inline-flex gap-0.5 rounded-lg border border-line bg-panel2 p-0.5" role="group" aria-label="Footage mode">
          {[["live", "Live"], ["last", "Last detection"], ["snaps", "Snapshots"]].map(([k, l]) => (
            <button key={k} type="button" onClick={() => setMode(k)} aria-pressed={mode === k}
              className={`min-h-8 rounded-md px-3 text-xs font-semibold ${mode === k ? "bg-[#1e2a3b] text-white" : "text-muted hover:text-ink"}`}>
              {l}
            </button>
          ))}
          <button type="button" aria-label="Close" onClick={onClose} className="ml-1 min-h-8 rounded-md px-2.5 text-lg leading-none text-muted hover:bg-[#1e2a3b] hover:text-white">×</button>
        </div>
      </div>

      <div ref={boxRef} className="relative aspect-video w-full overflow-hidden rounded-lg bg-black">
        {mode === "live" && (
          <>
            {live && (
              <img src={`/api/cameras/${encodeURIComponent(cam.id)}/frame.jpg?t=${tick}`} alt={`${cam.id} live footage`}
                className={`h-full w-full object-contain ${ok ? "" : "invisible"}`} onLoad={() => setOk(true)} onError={() => setOk(false)} />
            )}
            {(!live || !ok) && (
              <div className="absolute inset-0 flex items-center justify-center p-4 text-center text-sm text-muted">
                {!live ? `Offline${cam.seconds_since_seen != null ? `, last seen ${Math.round(cam.seconds_since_seen)} s ago` : ""}` : "Waiting for footage..."}
              </div>
            )}
            <span className="absolute left-2.5 top-2.5 rounded bg-black/70 px-2 py-1 font-mono text-[11px]">
              {live && <span className="mr-1.5 inline-block h-2 w-2 rounded-full bg-fire align-[1px]" />}{cam.id} {live ? "LIVE" : "OFFLINE"}
            </span>
            {live && (
              <span className="absolute bottom-2.5 left-2.5 rounded bg-black/70 px-2 py-1 font-mono text-[11px]">
                cam {cam.capture_fps ?? "-"} fps · AI {cam.inference_fps ?? "-"} fps · {cam.inference_ms ?? "-"} ms
              </span>
            )}
          </>
        )}
        {mode === "last" && (last?.snapshot_url ? (
          <>
            <img src={last.snapshot_url} alt={`${cam.id} detection snapshot`} className="h-full w-full object-contain" />
            <span className="absolute left-2.5 top-2.5 rounded bg-black/70 px-2 py-1 font-mono text-[11px]">
              {fmtTime(last.captured_at)} · {last.classes.join(" + ")} {Math.round(last.max_confidence * 100)}%
            </span>
          </>
        ) : <div className="absolute inset-0 flex items-center justify-center text-sm text-muted">No detection from this camera yet.</div>)}
        {mode === "snaps" && (mine.length ? (
          <div className="grid h-full grid-cols-3 gap-1 overflow-y-auto p-1">
            {mine.slice(0, 9).map((d) => (
              <a key={d.id} href={d.snapshot_url} target="_blank" rel="noreferrer" className="relative block">
                <img src={d.snapshot_url} alt={`Snapshot ${fmtTime(d.captured_at)}`} className="h-full w-full rounded object-cover" loading="lazy" />
                <span className="absolute bottom-1 left-1 rounded bg-black/70 px-1.5 font-mono text-[10px]">{fmtTime(d.captured_at)}</span>
              </a>
            ))}
          </div>
        ) : <div className="absolute inset-0 flex items-center justify-center text-sm text-muted">No snapshots yet.</div>)}
      </div>

      <div className="mt-3 grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-2">
        <Fact k="Tower">{tower ? `${tower.id} ${tower.name}` : "Not linked"}</Fact>
        <Fact k="Source">{cam.source_type === "usb" ? "USB webcam" : cam.source_type || "-"} · {cam.device || "-"}</Fact>
        <Fact k="Heading">{cam.heading_deg != null ? `${cam.heading_deg} deg` : <NotMeasured />}</Fact>
        <Fact k="Field of view">{cam.hfov_deg != null ? `${cam.hfov_deg} deg` : <NotMeasured />}</Fact>
        <Fact k="Last detection">{last ? `${fmtTime(last.captured_at)}, ${last.classes.join("+")} ${Math.round(last.max_confidence * 100)}%` : "none"}</Fact>
        <Fact k="Model">{cam.model_name || "-"}</Fact>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" className="btn-primary" disabled={!tower || tower.source === "PENDING"} onClick={() => { onShowOnTwin(tower.id); onClose?.(); }}>
          Show on twin
        </button>
        <button type="button" className="btn" disabled={!live} onClick={() => boxRef.current?.requestFullscreen?.()}>Full screen</button>
        {!cam.bearing_ready && (
          <span className="self-center text-[12px] text-muted">No bearing line until heading and field of view are measured (SETUP).</span>
        )}
      </div>
    </section>
    </div>
  );
}

// All cameras as a strip of live thumbnails, detecting first.
export function CameraStrip({ cameras, towersById, selectedCamId, onSelect }) {
  return (
    <section className="card">
      <div className="mb-2.5 flex items-center justify-between">
        <h2 className="h-label">All cameras</h2>
        <span className="text-[11.5px] text-muted">Detecting first</span>
      </div>
      {!cameras.length && <p className="text-sm text-muted">No camera has registered yet.</p>}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {cameras.map((c) => (
          <button key={c.id} type="button" onClick={() => onSelect(c.id)} aria-pressed={c.id === selectedCamId}
            className={`flex w-40 shrink-0 flex-col gap-1.5 rounded-lg border p-1.5 text-left ${c.id === selectedCamId
              ? "border-accent bg-[#10213a] ring-1 ring-accent" : "border-[#1b2430] bg-panel2 hover:border-[#334155]"}`}>
            <LiveThumb cam={c} className="aspect-video w-full" />
            <span className="flex items-center justify-between gap-1">
              <b className="truncate text-[12.5px]">{c.id}</b>
              <StateBadge state={camState(c)} />
            </span>
            <span className="truncate text-[11px] text-muted">{towersById.get(c.watchtower_id)?.id ?? "Not linked"}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
