// Map tools (collapsed by default): pick a point to read its coordinates, and
// fly the camera to a lat/lon. The picked point is a plain white ring labelled
// "MAP TOOL", so it cannot be mistaken for a watchtower or a fire.
import { useState } from "react";

const Row = ({ k, v }) => (
  <div className="flex justify-between gap-3 text-sm">
    <span className="text-muted">{k}</span>
    <span className="font-mono tabular-nums">{v}</span>
  </div>
);
const btn = "rounded-md border border-line bg-[#18262b] px-3 py-1.5 text-sm hover:border-accent disabled:opacity-40";
const input = "w-full rounded-md border border-line bg-bg px-2 py-1.5 font-mono text-sm";

export default function MapTools({ bridge }) {
  const { ready, picking, lastPick, lastError, send, clearError } = bridge;
  const [fly, setFly] = useState({ lat: "", lon: "" });

  function flyTo(e) {
    e.preventDefault();
    clearError();
    send("view.flyTo", { lat: Number(fly.lat), lon: Number(fly.lon) });
  }

  return (
    <details className="rounded-lg border border-line bg-panel p-4">
      <summary className="cursor-pointer text-xs font-semibold uppercase tracking-widest text-muted">Map tools</summary>

      <div className="mt-3 space-y-4">
        <div>
          <p className="mb-2 text-xs text-muted">Read the coordinates of any point on the map.</p>
          <div className="flex gap-2">
            {!picking ? (
              <button className={btn} disabled={!ready} onClick={() => send("pick.start")}>Pick a point</button>
            ) : (
              <button className={btn} onClick={() => send("pick.cancel")}>Cancel (Esc)</button>
            )}
            <button className={btn} disabled={!ready || !lastPick} onClick={() => send("marker.clear")}>Clear</button>
          </div>
          {picking && <p className="mt-2 text-xs text-accent">Click a point on the terrain or a building.</p>}
          {lastPick && (
            <div className="mt-3 space-y-1">
              <Row k="Latitude" v={lastPick.lat.toFixed(6)} />
              <Row k="Longitude" v={lastPick.lon.toFixed(6)} />
              <Row k="UTM E / N" v={`${lastPick.utm_e.toFixed(1)} / ${lastPick.utm_n.toFixed(1)}`} />
              <Row k="Elevation" v={`${lastPick.elev_m.toFixed(1)} m (${lastPick.hit})`} />
            </div>
          )}
        </div>

        <form onSubmit={flyTo} className="space-y-2">
          <p className="text-xs text-muted">Fly the camera to a coordinate.</p>
          <div className="grid grid-cols-2 gap-2">
            <input className={input} placeholder="Latitude" value={fly.lat} onChange={(e) => setFly({ ...fly, lat: e.target.value })} />
            <input className={input} placeholder="Longitude" value={fly.lon} onChange={(e) => setFly({ ...fly, lon: e.target.value })} />
          </div>
          <button className={`${btn} w-full`} disabled={!ready || !fly.lat || !fly.lon}>Fly</button>
          {lastError && <p className="text-xs text-red-400">{lastError}</p>}
        </form>
      </div>
    </details>
  );
}
