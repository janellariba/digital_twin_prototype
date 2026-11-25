// Dashboard shell: top bar, four views (LIVE, SIMULATION, LAB, SETUP) and the
// digital twin. The twin iframe stays mounted in the same place for every view
// (hidden on LAB and SETUP) so switching views never reloads the 8.6 MB file.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import DigitalTwin from "./components/DigitalTwin.jsx";
import TopBar, { TABS } from "./components/TopBar.jsx";
import TwinToolbar, { TwinLegend } from "./components/TwinToolbar.jsx";
import TowerList from "./components/TowerList.jsx";
import CameraViewer, { CameraStrip } from "./components/CameraViewer.jsx";
import DetectionPanel from "./components/DetectionPanel.jsx";
import SimulationPanel from "./components/SimulationPanel.jsx";
import MapTools from "./components/MapTools.jsx";
import SetupView from "./views/SetupView.jsx";
import LabView from "./views/LabView.jsx";
import { useTwinBridge } from "./services/useTwinBridge.js";
import { api } from "./services/api.js";
import { usePolling } from "./services/usePolling.js";
import { loadWatchtowers, reloadWatchtowers } from "./services/watchtowers.js";
import { groupCameras, towerState, byUrgency } from "./services/status.jsx";

// Display refresh rates (dashboard only; do not affect detection).
const CAMERA_POLL_MS = 1000;
const DETECTION_POLL_MS = 2000;
const fetchDetections = () => api.get("/api/detections?limit=30");
const ALL_LAYERS = { terrain: true, buildings: true, roads: true, sidewalks: true, boundaries: true };

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
  const { ready, send, selectedTowerId } = bridge;

  // The view is kept in the address (#live, #setup, ...) so a refresh or a link opens the same view.
  const [tab, setTabState] = useState(() => {
    const h = window.location.hash.slice(1).toUpperCase();
    return TABS.includes(h) ? h : "LIVE";
  });
  const setTab = useCallback((t) => { setTabState(t); window.history.replaceState(null, "", `#${t.toLowerCase()}`); }, []);
  const [towers, setTowers] = useState([]);
  const [towerErrors, setTowerErrors] = useState([]);
  const [loadingTowers, setLoadingTowers] = useState(false);
  const [towersVisible, setTowersVisible] = useState(true);
  const [layers, setLayers] = useState(ALL_LAYERS);
  const [selectedCamId, setSelectedCamId] = useState(null);

  // Cameras: polled, plus an immediate refresh after a SETUP change.
  const [camNonce, setCamNonce] = useState(0);
  const fetchCameras = useCallback(() => api.get("/api/cameras"), [camNonce]); // eslint-disable-line react-hooks/exhaustive-deps
  const [cameras, cameraError] = usePolling(fetchCameras, CAMERA_POLL_MS, []);
  const [detections, detectionError] = usePolling(fetchDetections, DETECTION_POLL_MS, []);

  const towersById = useMemo(() => new Map(towers.map((t) => [t.id, t])), [towers]);
  const groups = useMemo(() => groupCameras(towers, cameras), [towers, cameras]);
  const camsSorted = useMemo(() => [...cameras].sort(byUrgency), [cameras]);
  const online = cameras.filter((c) => c.state === "ONLINE").length;
  const detectingCams = cameras.filter((c) => c.detecting);

  const reload = useCallback(async (fromFile = false) => {
    setLoadingTowers(true);
    try {
      const { towers, errors } = await (fromFile ? reloadWatchtowers() : loadWatchtowers());
      setTowers(towers);
      setTowerErrors(errors);
    } catch (err) {
      setTowers([]);
      setTowerErrors([err.message]);
    } finally {
      setLoadingTowers(false);
    }
  }, []);
  useEffect(() => { reload(); }, [reload]);

  // Towers to the map whenever the list changes or the twin (re)connects.
  useEffect(() => { if (ready) send("watchtowers.set", { towers }); }, [ready, towers, send]);

  // Tower status (pin colour + camera count) to the map, only when it changes.
  const lastStatus = useRef("");
  useEffect(() => {
    if (!ready) return;
    const status = {};
    for (const t of towers) {
      const cams = groups.byTower.get(t.id) ?? [];
      status[t.id] = { state: towerState(cams), cameras: cams.length };
    }
    const key = JSON.stringify(status);
    if (key === lastStatus.current) return;
    lastStatus.current = key;
    send("watchtowers.status", { towers: status });
  }, [ready, towers, groups, send]);
  useEffect(() => { if (!ready) lastStatus.current = ""; }, [ready]);

  // Default selection: the most urgent camera, until the user picks one.
  useEffect(() => {
    if (!cameras.length) return;
    if (!selectedCamId || !cameras.some((c) => c.id === selectedCamId)) setSelectedCamId(camsSorted[0].id);
  }, [cameras, camsSorted, selectedCamId]);

  const selectedCam = cameras.find((c) => c.id === selectedCamId) ?? null;
  const selectedTower = selectedCam ? towersById.get(selectedCam.watchtower_id) ?? null : null;

  const selectCamera = useCallback((id) => {
    setSelectedCamId(id);
    setTab("LIVE");
    const cam = cameras.find((c) => c.id === id);
    const t = cam && towersById.get(cam.watchtower_id);
    if (t && t.source !== "PENDING") send("watchtower.select", { id: t.id, fly: false });
  }, [cameras, towersById, send, setTab]);

  const flyToTower = useCallback((id) => send("watchtower.select", { id, fly: true }), [send]);

  // Clicking a tower on the map selects its most urgent camera.
  useEffect(() => {
    if (!selectedTowerId) return;
    const cams = [...(groups.byTower.get(selectedTowerId) ?? [])].sort(byUrgency);
    if (cams.length && !cams.some((c) => c.id === selectedCamId)) setSelectedCamId(cams[0].id);
  }, [selectedTowerId]); // eslint-disable-line react-hooks/exhaustive-deps

  const cameraTower = useCallback((camId) => cameras.find((c) => c.id === camId)?.watchtower_id ?? null, [cameras]);
  const showTwin = tab === "LIVE" || tab === "SIMULATION";

  const twin = (
    <section className={`card p-2.5 ${showTwin ? "" : "hidden"}`}>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2 px-1">
        <h2 className="h-label">Muntinlupa digital twin</h2>
        <div className="flex flex-wrap gap-1.5 text-[10.5px] font-bold tracking-wider">
          <span className="rounded-md border border-[#2b5a85] px-1.5 py-0.5 text-[#7cc4ff]">REAL</span>
          <span className="rounded-md border border-[#6b5520] px-1.5 py-0.5 text-[#f0c35a]">SYNTHETIC</span>
          <span className="rounded-md border border-[#5a3f8a] px-1.5 py-0.5 text-[#c9a9ff]">SIMULATED</span>
          <span className="rounded-md border border-[#1f6b62] px-1.5 py-0.5 text-[#5eead4]">AI</span>
        </div>
      </div>
      <div className="relative h-[52vh] min-h-[380px]">
        <DigitalTwin iframeRef={iframeRef} ready={ready} />
        <TwinToolbar
          layers={layers}
          onLayers={(l) => { setLayers(l); send("layers.set", l); }}
          onOverview={() => send("view.overview")}
          towersVisible={towersVisible}
          onTowersVisible={(v) => { setTowersVisible(v); send("watchtowers.visible", { visible: v }); }}
        />
        <TwinLegend />
      </div>
    </section>
  );

  return (
    <div className="flex min-h-full flex-col">
      <TopBar tab={tab} onTab={setTab} serverOk={!cameraError} twinReady={ready}
        camsOnline={online} camsTotal={cameras.length} detecting={detectingCams.length} />

      {detectingCams.length > 0 && tab === "LIVE" && (
        <div role="status" className="mx-5 mt-3 flex flex-wrap items-center gap-3 rounded-xl border border-[#7f1d32] bg-[#22101a] px-4 py-2.5 text-sm">
          <span className="rounded-md bg-[#3f1220] px-2 py-0.5 text-[10.5px] font-bold tracking-wider text-[#fda4af]">FIRE / SMOKE</span>
          <span>
            Detected by {detectingCams.map((c) => `${c.id}${c.watchtower_id ? ` (${c.watchtower_id})` : ""}`).join(", ")}
          </span>
          <button type="button" className="btn-primary ml-auto" onClick={() => selectCamera(detectingCams[0].id)}>View footage</button>
        </div>
      )}
      {cameraError && (
        <p className="mx-5 mt-3 rounded-lg border border-[#5a2030] bg-[#22101a] px-4 py-2 text-sm text-[#fecdd3]">{cameraError}</p>
      )}

      <main className="flex flex-1 flex-wrap gap-3.5 p-5 pt-3">
        {tab === "LIVE" && (
          <aside className="flex min-w-0 flex-[1_1_320px] flex-col gap-3 lg:max-w-[380px]">
            <TowerList towers={towers} groups={groups} selectedCamId={selectedCamId} selectedTowerId={selectedTower?.id}
              onSelectCamera={selectCamera} onFlyTo={flyToTower} />
          </aside>
        )}

        <div className="flex min-w-0 flex-[999_1_560px] flex-col gap-3.5">
          {twin}
          {tab === "LIVE" && (
            <>
              <CameraViewer cam={selectedCam} tower={selectedTower} detections={detections} onShowOnTwin={flyToTower} />
              <CameraStrip cameras={camsSorted} towersById={towersById} selectedCamId={selectedCamId} onSelect={selectCamera} />
            </>
          )}
          {tab === "LAB" && <LabView cameras={cameras} />}
          {tab === "SETUP" && (
            <SetupView towers={towers} towerErrors={towerErrors} groups={groups} loadingTowers={loadingTowers}
              onReloadTowers={() => reload(true)} onCamerasChanged={() => setCamNonce((n) => n + 1)} bridgeLog={bridge.log} />
          )}
        </div>

        {tab === "LIVE" && (
          <aside className="flex min-w-0 flex-[1_1_300px] flex-col gap-3 lg:max-w-[360px]">
            <DetectionPanel detections={detections} error={detectionError} cameraTower={cameraTower} onSelectCamera={selectCamera} />
            <section className="card text-[13px] text-muted">
              <h2 className="h-label mb-1.5">Incidents</h2>
              Grouping detections from several towers into one incident with a location comes with the incident engine.
            </section>
          </aside>
        )}
        {tab === "SIMULATION" && (
          <aside className="flex min-w-0 flex-[1_1_320px] flex-col gap-3 lg:max-w-[400px]">
            <SimulationPanel
              bridge={bridge}
              onShow={(sim) => send("simulation.show", toTwinSimulation(sim))}
              onClear={() => send("simulation.clear")}
            />
            <MapTools bridge={bridge} />
          </aside>
        )}
      </main>
    </div>
  );
}
