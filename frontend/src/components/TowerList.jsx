// LIVE left column: one card per watchtower with its linked cameras underneath.
// Clicking a camera opens it in the Camera view.
import { useState } from "react";
import TowerIcon from "./TowerIcon.jsx";
import LiveThumb from "./LiveThumb.jsx";
import { camState, towerState, StateBadge, byUrgency } from "../services/status.jsx";

// Inline live feed shown under the selected camera, inside its tower card.
function InlineFeed({ cam, onLarge, onShowOnTwin, canFly }) {
  const off = cam.state === "OFFLINE";
  return (
    <div className="mt-2 rounded-lg border border-accent/60 bg-panel2 p-2">
      <div className="relative">
        <LiveThumb cam={cam} refreshMs={500} fit="contain" alt={`${cam.id} live footage`} className="aspect-video w-full" />
        {!off && (
          <span className="absolute left-2 top-2 rounded bg-black/70 px-1.5 py-0.5 font-mono text-[10.5px]">
            <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-fire align-[1px]" />LIVE
          </span>
        )}
      </div>
      <div className="mt-1.5 flex flex-wrap items-center justify-between gap-1 font-mono text-[11px] text-muted">
        <span>cam {cam.capture_fps ?? "-"} fps · AI {cam.inference_fps ?? "-"} fps</span>
        <span>{cam.heading_deg != null ? `heading ${cam.heading_deg} deg` : "heading not measured"}</span>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        <button type="button" className="btn-primary" onClick={onLarge}>Large view</button>
        {canFly && <button type="button" className="btn" onClick={onShowOnTwin}>Show on twin</button>}
      </div>
    </div>
  );
}

function CameraRow({ cam, selected, onSelect, onLarge, onShowOnTwin, canFly }) {
  const st = camState(cam);
  const info = st === "offline"
    ? cam.seconds_since_seen != null ? `No heartbeat for ${Math.round(cam.seconds_since_seen)} s` : "Never connected"
    : `${cam.source_type === "usb" ? "USB webcam" : cam.source_type?.toUpperCase() || "camera"}, AI ${cam.inference_fps ?? "-"} fps`;
  return (
    <li>
      <button type="button" onClick={() => onSelect(selected ? null : cam.id)} aria-pressed={selected} aria-expanded={selected}
        className={`flex w-full items-center gap-2.5 rounded-lg border p-2 text-left transition ${selected
          ? "border-accent bg-[#10213a] ring-1 ring-accent" : "border-[#1b2430] bg-panel2 hover:border-[#334155]"}`}>
        <LiveThumb cam={cam} className="h-12 w-20 shrink-0" />
        <span className="min-w-0 flex-1">
          <span className="flex items-center justify-between gap-2">
            <b className="truncate text-[13px]">{cam.id}</b>
            <StateBadge state={st} />
          </span>
          <span className="block truncate text-[11.5px] text-muted">{info}</span>
        </span>
      </button>
      {selected && <InlineFeed cam={cam} onLarge={onLarge} onShowOnTwin={onShowOnTwin} canFly={canFly} />}
    </li>
  );
}

export default function TowerList({ towers, groups, selectedCamId, selectedTowerId, onSelectCamera, onFlyTo, onLarge }) {
  const [filter, setFilter] = useState("all");
  const rows = towers.map((t) => {
    const cams = [...(groups.byTower.get(t.id) ?? [])].sort(byUrgency);
    return { t, cams, state: towerState(cams) };
  });
  const counts = {
    all: rows.length,
    detecting: rows.filter((r) => r.state === "detecting").length,
    issues: rows.filter((r) => r.state === "offline" || r.state === "nolink").length,
  };
  const shown = rows
    .filter((r) => filter === "all" || (filter === "detecting" ? r.state === "detecting" : r.state === "offline" || r.state === "nolink"))
    .sort((a, b) => (a.state === "detecting" ? -1 : 0) - (b.state === "detecting" ? -1 : 0));

  return (
    <div className="flex flex-col gap-3">
      <div className="card">
        <div className="mb-2.5 flex items-center justify-between">
          <h2 className="h-label">Watchtowers</h2>
          <span className="text-[11.5px] text-muted">Click a camera to view it</span>
        </div>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter towers">
          {[["all", "All"], ["detecting", "Detecting"], ["issues", "Issues"]].map(([k, l]) => (
            <button key={k} type="button" className={`chip ${filter === k ? "chip-on" : ""}`} onClick={() => setFilter(k)}>
              {l} {counts[k]}
            </button>
          ))}
        </div>
      </div>

      {shown.map(({ t, cams, state }) => (
        <article key={t.id} className={`overflow-hidden rounded-xl border bg-panel ${t.id === selectedTowerId ? "border-accent ring-1 ring-accent" : "border-line"}`}>
          <div className="flex items-start gap-3 px-3.5 pt-3">
            <TowerIcon state={state} count={cams.length} size={36} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <b className="text-[15px] tracking-wide">{t.id}</b>
                <StateBadge state={state} />
              </div>
              <div className="truncate text-[13px] text-muted">{t.name}{t.site ? `, ${t.site}` : ""}</div>
              <div className="text-[11px] text-muted">
                {t.source === "REAL" ? "REAL coordinates" : t.source} {t.source === "PENDING" ? "(no position yet)" : ""}
              </div>
            </div>
          </div>
          <ul className="flex flex-col gap-2 px-3.5 pt-2.5">
            {cams.map((c) => (
              <CameraRow key={c.id} cam={c} selected={c.id === selectedCamId} onSelect={onSelectCamera}
                onLarge={onLarge} onShowOnTwin={() => onFlyTo(t.id)} canFly={t.source !== "PENDING"} />
            ))}
            {!cams.length && (
              <li className="rounded-lg border border-dashed border-[#3a2f12] p-2.5 text-[12px] text-[#fbbf24]">
                No camera linked. Link one in SETUP.
              </li>
            )}
          </ul>
          <div className="flex gap-1.5 px-3.5 py-3">
            <button type="button" className="btn" disabled={t.source === "PENDING"} onClick={() => onFlyTo(t.id)}>Fly to</button>
          </div>
        </article>
      ))}

      {groups.unlinked.length > 0 && (
        <article className="rounded-xl border border-dashed border-line bg-panel/60 p-3.5">
          <h3 className="h-label mb-2">Not linked to a tower</h3>
          <ul className="flex flex-col gap-2">
            {groups.unlinked.map((c) => (
              <CameraRow key={c.id} cam={c} selected={c.id === selectedCamId} onSelect={onSelectCamera}
                onLarge={onLarge} canFly={false} />
            ))}
          </ul>
          <p className="mt-2 text-[11.5px] text-muted">These cameras appear on the map once linked in SETUP.</p>
        </article>
      )}
    </div>
  );
}
