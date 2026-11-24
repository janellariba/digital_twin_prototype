// Main page: header, digital twin, and side panels.
// Watchtowers and simulations come from the FastAPI server (PostgreSQL).
import { useCallback, useEffect, useRef, useState } from "react";
import DigitalTwin from "./components/DigitalTwin.jsx";
import WatchtowerPanel from "./components/WatchtowerPanel.jsx";
import MapTools from "./components/MapTools.jsx";
import MessageLog from "./components/MessageLog.jsx";
import { useTwinBridge } from "./services/useTwinBridge.js";
import SimulationPanel from "./components/SimulationPanel.jsx";
import CameraGrid from "./components/CameraGrid.jsx";
import DetectionPanel from "./components/DetectionPanel.jsx";
import { api } from "./services/api.js";
import { usePolling } from "./services/usePolling.js";
import { loadWatchtowers, reloadWatchtowers } from "./services/watchtowers.js";

// Display refresh rates (dashboard only; do not affect detection).
const CAMERA_POLL_MS = 1000;
const DETECTION_POLL_MS = 2000;
const fetchCameras = () => api.get("/api/cameras");
const fetchDetections = () => api.get("/api/detections?limit=15");

// Only what the map needs to draw a simulation.
function toTwinSimulation(sim) {
  const r = sim.result;
  return {
    id: sim.id,
    truth: { lat: sim.truth.lat, lon: sim.truth.lon },
    rays: sim.observations.map((o) => ({
      tower_id: o.tower_id,
      from: { lat: o.tower_lat, lon: o.tower_lon },
      to: { lat: o.ray_end.lat, lon: o.ray_end.lon },
    })),
    estimate: r?.status === "ok" ? { lat: r.estimate.lat, lon: r.estimate.lon, error_m: r.error_m } : null,
    ellipse: r?.status === "ok" ? r.ellipse_95 : null,
  };
}

export default function App() {
  const iframeRef = useRef(null);
  const bridge = useTwinBridge(iframeRef);
  const { ready, send, towerReport, selectedTowerId } = bridge;

  const [towers, setTowers] = useState([]);
  const [towerErrors, setTowerErrors] = useState([]);
  const [loading, setLoading] = useState(false);
  const [towersVisible, setTowersVisible] = useState(true);
  const [cameras, cameraError] = usePolling(fetchCameras, CAMERA_POLL_MS, []);
  const [detections, detectionError] = usePolling(fetchDetections, DETECTION_POLL_MS, []);
  const online = cameras.filter((c) => c.state === "ONLINE").length;
  const detectingCount = cameras.filter((c) => c.detecting).length;

  const reload = useCallback(async (fromFile = false) => {
    setLoading(true);
    try {
      const { towers, errors } = await (fromFile ? reloadWatchtowers() : loadWatchtowers());
      setTowers(towers);
      setTowerErrors(errors);
    } catch (err) {
      setTowers([]);
      setTowerErrors([err.message]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { reload(); }, [reload]);

  // Send towers to the map whenever the list changes or the twin (re)connects.
  useEffect(() => {
    if (ready) send("watchtowers.set", { towers });
  }, [ready, towers, send]);


  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between border-b border-line px-5 py-3">
        <div>
          <h1 className="text-lg font-semibold uppercase tracking-wide">
            AI-SUNOG <span className="text-accent">Monitoring Prototype</span>
          </h1>
          <p className="text-xs text-muted">Cameras, AI detection, digital twin and fire simulation</p>
        </div>
        <div className="flex items-center gap-3 font-mono text-xs">
          <span className={`rounded-full border px-3 py-1 ${detectingCount ? "animate-pulse border-red-500 text-red-300" : "border-line text-muted"}`}>
            {detectingCount ? `FIRE/SMOKE: ${detectingCount} camera(s)` : "No detections"}
          </span>
          <span className="rounded-full border border-line px-3 py-1 text-muted">
            Cameras online: {online} / {cameras.length}
          </span>
          <span className="rounded-full border border-line px-3 py-1 text-muted">
            Towers on map: {towerReport ? towerReport.drawn : "-"} / {towers.length}
          </span>
          <span className={`rounded-full border px-3 py-1 ${ready ? "border-emerald-500 text-emerald-400" : "border-line text-muted"}`}>
            {ready ? "TWIN CONNECTED" : "TWIN LOADING"}
          </span>
        </div>
      </header>

      <main className="flex min-h-0 flex-1 gap-4 p-4">
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <CameraGrid cameras={cameras} error={cameraError} />
          <div className="min-h-[360px] flex-1">
            <DigitalTwin iframeRef={iframeRef} ready={ready} />
          </div>
        </div>
        <aside className="flex w-80 shrink-0 flex-col gap-3 overflow-y-auto">
          <WatchtowerPanel
            towers={towers}
            errors={towerErrors}
            report={towerReport}
            selectedId={selectedTowerId}
            visible={towersVisible}
            loading={loading}
            onReload={() => reload(true)}
            onSelect={(id) => send("watchtower.select", { id })}
            onToggle={(v) => { setTowersVisible(v); send("watchtowers.visible", { visible: v }); }}
          />
          <DetectionPanel detections={detections} error={detectionError} />
          <SimulationPanel
            bridge={bridge}
            onShow={(sim) => send("simulation.show", toTwinSimulation(sim))}
            onClear={() => send("simulation.clear")}
          />
          <MapTools bridge={bridge} />
          <MessageLog log={bridge.log} />
        </aside>
      </main>
    </div>
  );
}
