// Step 1 test panel: twin status, click-to-pick, fly-to.
import { useState } from "react";

const Card = ({ title, children }) => (
  <section className="rounded-lg border border-line bg-panel p-4">
    <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted">{title}</h2>
    {children}
  </section>
);
const Row = ({ k, v }) => (
  <div className="flex justify-between gap-3 text-sm">
    <span className="text-muted">{k}</span>
    <span className="font-mono tabular-nums">{v}</span>
  </div>
);
const btn = "rounded-md border border-line bg-[#18262b] px-3 py-1.5 text-sm hover:border-accent disabled:opacity-40";
const btnPrimary = "rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-[#1b1206] disabled:opacity-40";
const input = "w-full rounded-md border border-line bg-bg px-2 py-1.5 font-mono text-sm";

export default function TwinControls({ bridge }) {
  const { ready, info, picking, lastPick, lastError, send, clearError } = bridge;
  const [fly, setFly] = useState({ lat: "", lon: "", distance_m: "2600" });

  function flyTo(e) {
    e.preventDefault();
    clearError();
    send("view.flyTo", { lat: Number(fly.lat), lon: Number(fly.lon), distance_m: Number(fly.distance_m) });
  }

  return (
    <div className="flex flex-col gap-3">
      <Card title="Digital twin">
        <Row k="Status" v={ready ? "Ready" : "Loading"} />
        {info && (
          <>
            <Row k="CRS" v={info.crs} />
            <Row k="Origin E / N" v={`${info.origin_utm[0]} / ${info.origin_utm[1]}`} />
            <Row k="Bridge" v={`v${info.bridge_version}`} />
          </>
        )}
      </Card>

      <Card title="Pick location">
        <div className="flex gap-2">
          {!picking ? (
            <button className={btnPrimary} disabled={!ready} onClick={() => send("pick.start")}>
              Pick on map
            </button>
          ) : (
            <button className={btn} onClick={() => send("pick.cancel")}>Cancel (Esc)</button>
          )}
          <button className={btn} disabled={!ready || !lastPick} onClick={() => send("marker.clear")}>
            Clear marker
          </button>
        </div>
        {picking && <p className="mt-2 text-xs text-accent">Click a point on the terrain or a building.</p>}
        {lastPick && (
          <div className="mt-3 space-y-1">
            <Row k="Latitude" v={lastPick.lat.toFixed(6)} />
            <Row k="Longitude" v={lastPick.lon.toFixed(6)} />
            <Row k="UTM E" v={lastPick.utm_e.toFixed(1)} />
            <Row k="UTM N" v={lastPick.utm_n.toFixed(1)} />
            <Row k="Elevation" v={`${lastPick.elev_m.toFixed(1)} m (${lastPick.hit})`} />
            <Row k="Ground (DEM)" v={`${lastPick.ground_elev_m.toFixed(1)} m`} />
            <button
              className={`${btn} mt-2 w-full`}
              onClick={() => setFly((f) => ({ ...f, lat: lastPick.lat.toFixed(6), lon: lastPick.lon.toFixed(6) }))}
            >
              Use for fly-to
            </button>
          </div>
        )}
      </Card>

      <Card title="Fly to">
        <form onSubmit={flyTo} className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <input className={input} placeholder="Latitude" value={fly.lat}
              onChange={(e) => setFly({ ...fly, lat: e.target.value })} />
            <input className={input} placeholder="Longitude" value={fly.lon}
              onChange={(e) => setFly({ ...fly, lon: e.target.value })} />
          </div>
          <label className="block text-xs text-muted">
            View distance (m)
            <input className={`${input} mt-1`} value={fly.distance_m}
              onChange={(e) => setFly({ ...fly, distance_m: e.target.value })} />
          </label>
          <button className={`${btnPrimary} w-full`} disabled={!ready || !fly.lat || !fly.lon}>Fly</button>
        </form>
        {lastError && <p className="mt-2 text-xs text-red-400">{lastError}</p>}
      </Card>
    </div>
  );
}
