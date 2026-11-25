// SETUP: watchtowers with their cameras, linking, and measured heading / field of view.
// Everything saved here goes to PostgreSQL and is listed in the change history.
// Empty heading or field of view means NOT MEASURED: no bearing is computed without them.
import { useCallback, useState } from "react";
import { api } from "../services/api.js";
import { usePolling } from "../services/usePolling.js";
import { camState, towerState, StateBadge } from "../services/status.jsx";
import TowerIcon from "../components/TowerIcon.jsx";
import MessageLog from "../components/MessageLog.jsx";

const fetchChanges = () => api.get("/api/changes?limit=15");
const FIELD_NAME = { watchtower_id: "tower", heading_deg: "heading", hfov_deg: "field of view" };
const toStr = (v) => (v === null || v === undefined ? "" : String(v));

function CameraEditor({ cam, towers, onSaved }) {
  const [form, setForm] = useState({ tower: toStr(cam.watchtower_id), heading: toStr(cam.heading_deg), hfov: toStr(cam.hfov_deg) });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  // Follow server values when they change elsewhere, unless the user is editing.
  const server = { tower: toStr(cam.watchtower_id), heading: toStr(cam.heading_deg), hfov: toStr(cam.hfov_deg) };
  const dirty = form.tower !== server.tower || form.heading !== server.heading || form.hfov !== server.hfov;

  async function save() {
    const body = {};
    if (form.tower !== server.tower) body.watchtower_id = form.tower || null;
    for (const [k, f, lo, hi] of [["heading_deg", "heading", 0, 360], ["hfov_deg", "hfov", 0, 180]]) {
      if (form[f] === server[f]) continue;
      if (form[f].trim() === "") { body[k] = null; continue; }
      const x = Number(form[f]);
      if (!Number.isFinite(x) || x < lo || x > hi || (k === "heading_deg" && x === 360) || (k === "hfov_deg" && x === 0)) {
        setMsg({ err: true, text: `${f === "heading" ? "Heading" : "Field of view"} must be ${k === "heading_deg" ? "0 to below 360" : "above 0 up to 180"}` });
        return;
      }
      body[k] = x;
    }
    setBusy(true); setMsg(null);
    try {
      await api.patch(`/api/cameras/${encodeURIComponent(cam.id)}`, body);
      setMsg({ err: false, text: "Saved" });
      onSaved();
    } catch (e) {
      setMsg({ err: true, text: e.message });
    } finally {
      setBusy(false);
    }
  }

  const id = (s) => `${cam.id}-${s}`;
  return (
    <div className="grid grid-cols-1 items-end gap-2.5 rounded-lg border border-[#1b2430] bg-panel2 p-3 sm:grid-cols-[minmax(0,1.2fr)_minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)_auto]">
      <div className="min-w-0">
        <div className="flex items-center gap-2"><b className="text-sm">{cam.id}</b><StateBadge state={camState(cam)} /></div>
        <div className="truncate text-[11.5px] text-muted">{cam.source || (cam.source_type === "usb" ? "USB webcam" : cam.source_type || "camera")}</div>
      </div>
      <label className="text-[12px] font-semibold text-[#c5d0db]" htmlFor={id("t")}>
        Watchtower
        <select id={id("t")} className="field mt-1" value={form.tower} onChange={(e) => setForm({ ...form, tower: e.target.value })}>
          <option value="">Not linked</option>
          {towers.map((t) => <option key={t.id} value={t.id}>{t.id} {t.name}</option>)}
        </select>
      </label>
      <label className="text-[12px] font-semibold text-[#c5d0db]" htmlFor={id("h")}>
        Heading (deg, true north)
        <input id={id("h")} className="field mt-1" inputMode="decimal" placeholder="Not measured" value={form.heading}
          onChange={(e) => setForm({ ...form, heading: e.target.value })} />
      </label>
      <label className="text-[12px] font-semibold text-[#c5d0db]" htmlFor={id("f")}>
        Field of view (deg)
        <input id={id("f")} className="field mt-1" inputMode="decimal" placeholder="Not measured" value={form.hfov}
          onChange={(e) => setForm({ ...form, hfov: e.target.value })} />
      </label>
      <div className="flex items-center gap-2">
        <button type="button" className="btn-primary" disabled={!dirty || busy} onClick={save}>Save</button>
        {dirty && <button type="button" className="btn-ghost" onClick={() => { setForm(server); setMsg(null); }}>Undo</button>}
      </div>
      {msg && <p className={`text-[12px] sm:col-span-5 ${msg.err ? "text-fire" : "text-ok"}`}>{msg.text}</p>}
    </div>
  );
}

export default function SetupView({ towers, towerErrors, groups, loadingTowers, onReloadTowers, onCamerasChanged, bridgeLog }) {
  const [changes, changesError] = usePolling(fetchChanges, 5000, []);
  const saved = useCallback(() => onCamerasChanged(), [onCamerasChanged]);

  return (
    <div className="flex flex-wrap gap-3.5">
      <div className="flex min-w-0 flex-[999_1_640px] flex-col gap-3.5">
        <section className="card">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="h-label">Watchtowers and their cameras</h2>
            <button type="button" className="btn" disabled={loadingTowers} onClick={onReloadTowers}>
              {loadingTowers ? "Reloading..." : "Reload towers from config file"}
            </button>
          </div>
          {towerErrors.length > 0 && (
            <ul className="mb-3 list-disc rounded-lg border border-[#5a2030] bg-[#22101a] p-3 pl-7 text-[12px] text-[#fecdd3]">
              {towerErrors.map((e) => <li key={e}>{e}</li>)}
            </ul>
          )}
          <div className="flex flex-col gap-4">
            {towers.map((t) => {
              const cams = groups.byTower.get(t.id) ?? [];
              return (
                <div key={t.id}>
                  <div className="mb-2 flex flex-wrap items-center gap-3">
                    <TowerIcon state={towerState(cams)} count={cams.length} size={26} />
                    <b>{t.id}</b><span className="text-sm text-muted">{t.name}{t.site ? `, ${t.site}` : ""}</span>
                    <span className="font-mono text-[12px] text-muted">{t.lat != null ? `${t.lat}, ${t.lon}` : "no position"}</span>
                    <span className={`rounded-md border px-2 py-0.5 text-[10.5px] font-bold tracking-wider ${t.source === "REAL" ? "border-[#2b5a85] text-[#7cc4ff]" : "border-[#6b5520] text-[#f0c35a]"}`}>{t.source}</span>
                  </div>
                  <div className="flex flex-col gap-2 pl-0 sm:pl-9">
                    {cams.map((c) => <CameraEditor key={c.id} cam={c} towers={towers} onSaved={saved} />)}
                    {!cams.length && <p className="text-[12.5px] text-[#fbbf24]">No camera linked. Pick this tower for a camera below.</p>}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section className="card">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="h-label">Cameras not linked to a tower</h2>
            <span className="text-[11.5px] text-muted">A camera appears here after its node registers</span>
          </div>
          <div className="flex flex-col gap-2">
            {groups.unlinked.map((c) => <CameraEditor key={c.id} cam={c} towers={towers} onSaved={saved} />)}
            {!groups.unlinked.length && <p className="text-sm text-muted">All registered cameras are linked.</p>}
          </div>
          <p className="mt-3 text-[12px] text-muted">
            Lab webcams can be linked to a city tower to test the dashboard. Their footage is still the lab room, and no bearing is
            drawn until the heading and field of view are measured.
          </p>
        </section>
      </div>

      <aside className="flex min-w-0 flex-[1_1_320px] flex-col gap-3.5 lg:max-w-[400px]">
        <section className="card">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="h-label">Detection thresholds</h2>
            <StateBadge state="nolink">TEMPORARY</StateBadge>
          </div>
          <p className="text-[13px] text-muted">
            Still set per camera node in <code className="font-mono text-ink">camera_node/config/detection.json</code>.
            Proposed: fire 0.50, smoke 0.65, confirm after 3 of 5 frames. Waiting for your approval before they move here.
          </p>
        </section>
        <section className="card">
          <h2 className="h-label mb-2.5">Change history</h2>
          {changesError && <p className="text-xs text-fire">{changesError}</p>}
          {!changesError && !changes.length && <p className="text-sm text-muted">No changes yet.</p>}
          <ol className="flex flex-col gap-1.5 text-[12.5px]">
            {changes.map((c) => (
              <li key={c.id} className="flex gap-2.5">
                <time className="w-[78px] shrink-0 whitespace-nowrap font-mono text-[11.5px] text-muted">
                  {new Date(c.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                </time>
                <span>{c.entity_id} {FIELD_NAME[c.field] ?? c.field}: {c.old ?? "none"} to {c.new ?? "none"}</span>
              </li>
            ))}
          </ol>
        </section>
        <details className="card">
          <summary className="h-label cursor-pointer">Twin bridge log (debug)</summary>
          <div className="mt-3"><MessageLog log={bridgeLog} /></div>
        </details>
      </aside>
    </div>
  );
}
