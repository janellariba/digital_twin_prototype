// Simulated fire: place a ground-truth fire, generate noisy bearings from each
// tower, and show the triangulated estimate next to the truth with its error.
// Everything here is labelled SIMULATED; nothing comes from a camera yet.
import { useCallback, useEffect, useState } from "react";
import { api } from "../services/api.js";

const btn = "rounded-md border border-line bg-[#18262b] px-3 py-1.5 text-sm hover:border-accent disabled:opacity-40";
const btnPrimary = "rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-white disabled:opacity-40";
const input = "w-full rounded-md border border-line bg-bg px-2 py-1.5 font-mono text-sm";
const fmt = (x, d = 1) => (x === null || x === undefined ? "-" : Number(x).toFixed(d));

const Row = ({ k, v, accent }) => (
  <div className="flex justify-between gap-3 text-sm">
    <span className="text-muted">{k}</span>
    <span className={`font-mono tabular-nums ${accent ?? ""}`}>{v}</span>
  </div>
);

export default function SimulationPanel({ bridge, onShow, onClear }) {
  const { ready, picking, lastPick, send } = bridge;
  const [cfg, setCfg] = useState(null);
  const [form, setForm] = useState({ lat: "", lon: "", noise: 1, seed: "" });
  const [awaitPick, setAwaitPick] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState(null);
  const [current, setCurrent] = useState(null);
  const [history, setHistory] = useState([]);

  const refreshHistory = useCallback(async () => {
    try { setHistory(await api.get("/api/simulations?limit=10")); } catch (e) { setError(e.message); }
  }, []);

  useEffect(() => {
    api.get("/api/simulation/config")
      .then((c) => { setCfg(c); setForm((f) => ({ ...f, noise: c.bearing_noise_deg_default })); })
      .catch((e) => setError(e.message));
    refreshHistory();
  }, [refreshHistory]);

  // When the user picks a point for the fire, copy it into the form.
  useEffect(() => {
    if (awaitPick && lastPick) {
      setForm((f) => ({ ...f, lat: lastPick.lat.toFixed(6), lon: lastPick.lon.toFixed(6) }));
      setAwaitPick(false);
      send("marker.clear");
    }
  }, [lastPick]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!picking) setAwaitPick(false); }, [picking]);

  function show(sim) { setCurrent(sim); onShow(sim); }

  async function run(e) {
    e.preventDefault();
    setError(null);
    setRunning(true);
    try {
      const body = { lat: Number(form.lat), lon: Number(form.lon), noise_deg: Number(form.noise) };
      if (form.seed !== "") body.seed = Number(form.seed);
      show(await api.post("/api/simulations", body));
      refreshHistory();
    } catch (err) {
      setError(err.message);
    } finally {
      setRunning(false);
    }
  }

  async function remove(id) {
    try {
      await api.del(`/api/simulations/${id}`);
      if (current?.id === id) { setCurrent(null); onClear(); }
      refreshHistory();
    } catch (e) { setError(e.message); }
  }

  async function resetAll() {
    if (!window.confirm("Delete all simulations, their bearings and estimates?")) return;
    try {
      await api.del("/api/simulations");
      setCurrent(null); onClear(); refreshHistory();
    } catch (e) { setError(e.message); }
  }

  const res = current?.result;
  const usesSynthetic = current?.tower_sources?.includes("SYNTHETIC");

  return (
    <section className="rounded-lg border border-line bg-panel p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-muted">Fire simulation</h2>
        <span className="rounded-full border border-orange-400 px-2 py-0.5 font-mono text-[10px] text-orange-300">SIMULATED</span>
      </div>

      <form onSubmit={run} className="space-y-2">
        <p className="text-xs text-muted">1. Place the simulated fire (this is the ground truth).</p>
        <div className="flex gap-2">
          <button type="button" className={btn} disabled={!ready || picking}
            onClick={() => { setAwaitPick(true); send("pick.start"); }}>
            {awaitPick ? "Click the map..." : "Pick on map"}
          </button>
          {awaitPick && <button type="button" className={btn} onClick={() => send("pick.cancel")}>Cancel</button>}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <input className={input} placeholder="Latitude" value={form.lat} onChange={(e) => setForm({ ...form, lat: e.target.value })} />
          <input className={input} placeholder="Longitude" value={form.lon} onChange={(e) => setForm({ ...form, lon: e.target.value })} />
        </div>

        <p className="pt-1 text-xs text-muted">2. Bearing error added to each tower (1 standard deviation).</p>
        <div className="flex items-center gap-3">
          <input type="range" className="flex-1 accent-accent" min={0} max={cfg?.bearing_noise_deg_max ?? 5} step={0.1}
            value={form.noise} onChange={(e) => setForm({ ...form, noise: e.target.value })} disabled={!cfg} />
          <span className="w-14 text-right font-mono text-sm">{fmt(form.noise)}°</span>
        </div>
        <input className={input} placeholder="Random seed (optional, for repeatable runs)" value={form.seed}
          onChange={(e) => setForm({ ...form, seed: e.target.value.replace(/\D/g, "") })} />

        <button className={`${btnPrimary} w-full`} disabled={running || !form.lat || !form.lon || !cfg}>
          {running ? "Running..." : "3. Run simulation"}
        </button>
        {error && <p className="text-xs text-red-400">{error}</p>}
      </form>

      {current && (
        <div className="mt-4 space-y-3 border-t border-line pt-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-widest text-muted">Result</span>
            <span className={`rounded-full border px-2 py-0.5 font-mono text-[10px] ${res?.status === "ok" ? "border-emerald-500 text-emerald-400" : "border-red-500 text-red-400"}`}>
              {res?.status === "ok" ? "LOCALIZED" : "REJECTED"}
            </span>
          </div>
          {usesSynthetic && <p className="text-[11px] text-fuchsia-300">Uses SYNTHETIC tower positions.</p>}

          <div className="space-y-1">
            <Row k="Ground truth" v={`${fmt(current.truth.lat, 6)}, ${fmt(current.truth.lon, 6)}`} accent="text-orange-300" />
            {res?.status === "ok" ? (
              <>
                <Row k="Estimate" v={`${fmt(res.estimate.lat, 6)}, ${fmt(res.estimate.lon, 6)}`} accent="text-yellow-300" />
                <Row k="Error" v={`${fmt(res.error_m)} m`} />
                <Row k="95% area" v={`${fmt(res.ellipse_95.semi_major_m, 0)} x ${fmt(res.ellipse_95.semi_minor_m, 0)} m`} />
                <Row k="Truth inside 95%" v={res.truth_inside_95 ? "yes" : "no"} />
                <Row k="Bearings used" v={res.n_rays} />
                <Row k="Widest ray angle" v={`${fmt(res.max_ray_angle_deg)}°`} />
                {res.residual_rms_deg !== null && <Row k="Residual (RMS)" v={`${fmt(res.residual_rms_deg, 2)}°`} />}
              </>
            ) : (
              <p className="text-sm text-red-300">{res?.reason}</p>
            )}
          </div>

          <table className="w-full font-mono text-xs">
            <thead className="text-muted">
              <tr><th className="text-left font-normal">Tower</th><th className="text-right font-normal">True</th><th className="text-right font-normal">Observed</th><th className="text-right font-normal">Err</th></tr>
            </thead>
            <tbody>
              {current.observations.map((o) => (
                <tr key={o.tower_id}>
                  <td>{o.tower_id}</td>
                  <td className="text-right">{fmt(o.true_bearing_deg, 2)}°</td>
                  <td className="text-right">{fmt(o.observed_bearing_deg, 2)}°</td>
                  <td className="text-right">{o.bearing_error_deg > 0 ? "+" : ""}{fmt(o.bearing_error_deg, 2)}°</td>
                </tr>
              ))}
            </tbody>
          </table>
          {current.skipped.length > 0 && (
            <p className="text-[11px] text-muted">Not used: {current.skipped.map((s) => `${s.tower_id} (${s.reason})`).join(", ")}</p>
          )}
          <p className="text-[11px] text-muted">Seed {current.seed}. Bearings are true-north bearings.</p>
        </div>
      )}

      <details className="mt-4 border-t border-line pt-3">
        <summary className="cursor-pointer text-xs text-muted">History ({history.length})</summary>
        <ul className="mt-2 space-y-1">
          {history.map((s) => (
            <li key={s.id} className="flex items-center justify-between gap-2 text-xs">
              <button className="truncate text-left hover:text-accent" onClick={() => show(s)}>
                {new Date(s.created_at).toLocaleTimeString()} · {s.noise_deg}° ·{" "}
                {s.result?.status === "ok" ? `${fmt(s.result.error_m)} m` : "rejected"}
              </button>
              <button className="text-muted hover:text-red-400" onClick={() => remove(s.id)} title="Delete">✕</button>
            </li>
          ))}
        </ul>
        {history.length > 0 && <button className={`${btn} mt-2 w-full`} onClick={resetAll}>Reset all simulations</button>}
      </details>
    </section>
  );
}
