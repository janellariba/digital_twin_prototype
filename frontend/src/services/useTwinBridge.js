// React side of the digital twin bridge.
// Sends commands to the twin iframe with postMessage and listens for replies.
// Only accepts messages from the twin iframe, on the same origin, with the
// expected envelope { ns, v, type, id, payload }.
import { useCallback, useEffect, useRef, useState } from "react";

const NS = "ai-sunog-twin";
const VERSION = 1;
const PING_INTERVAL_MS = 2000; // how often to ask "are you ready?" until the twin answers

// crypto.randomUUID only exists on https or localhost, so fall back for LAN IPs.
const makeId = () =>
  globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

const isNum = (x) => typeof x === "number" && Number.isFinite(x);
const PICK_FIELDS = ["lat", "lon", "utm_e", "utm_n", "local_e", "local_n", "elev_m", "ground_elev_m"];

export function useTwinBridge(iframeRef) {
  const [ready, setReady] = useState(false);
  const [info, setInfo] = useState(null); // twin.ready payload (CRS, origin, extent)
  const [picking, setPicking] = useState(false);
  const [lastPick, setLastPick] = useState(null);
  const [lastError, setLastError] = useState(null);
  const [log, setLog] = useState([]);
  const readyRef = useRef(false);
  const queue = useRef([]); // commands sent before the twin was ready

  const addLog = useCallback((dir, type, detail) => {
    setLog((l) => [{ key: makeId(), time: new Date(), dir, type, detail }, ...l].slice(0, 40));
  }, []);

  const postRaw = useCallback((msg) => {
    const win = iframeRef.current?.contentWindow;
    if (!win) return false;
    win.postMessage(msg, window.location.origin);
    return true;
  }, [iframeRef]);

  // Public: send a command. Queued until the twin says it is ready.
  const send = useCallback((type, payload = {}) => {
    const msg = { ns: NS, v: VERSION, type, id: makeId(), payload };
    if (!readyRef.current) {
      queue.current.push(msg);
      addLog("queued", type, payload);
    } else if (postRaw(msg)) {
      addLog("out", type, payload);
    }
    return msg.id;
  }, [addLog, postRaw]);

  useEffect(() => {
    function onMessage(ev) {
      if (ev.origin !== window.location.origin) return;
      if (!iframeRef.current || ev.source !== iframeRef.current.contentWindow) return;
      const m = ev.data;
      if (!m || typeof m !== "object" || m.ns !== NS || m.v !== VERSION || typeof m.type !== "string") return;
      const p = m.payload && typeof m.payload === "object" ? m.payload : {};

      switch (m.type) {
        case "twin.ready": {
          setInfo(p);
          if (!readyRef.current) {
            readyRef.current = true;
            setReady(true);
            // Flush anything sent before the twin finished loading.
            for (const msg of queue.current.splice(0)) postRaw(msg) && addLog("out", msg.type, msg.payload);
          }
          break;
        }
        case "pick.armed":
          setPicking(true);
          break;
        case "pick.result": {
          if (!PICK_FIELDS.every((k) => isNum(p[k]))) {
            addLog("rejected", m.type, "pick.result had missing or non-numeric fields");
            return;
          }
          setPicking(false);
          setLastPick({ ...p, hit: p.hit === "building" ? "building" : "terrain", time: new Date() });
          break;
        }
        case "pick.cancelled":
          setPicking(false);
          break;
        case "error":
          setLastError(String(p.message ?? "Unknown error").slice(0, 200));
          break;
        default:
          break; // pick.miss, view.flying, marker.cleared: logged only
      }
      addLog("in", m.type, p);
    }

    window.addEventListener("message", onMessage);
    // Keep pinging until the twin answers (covers any load-order race).
    const timer = setInterval(() => {
      if (readyRef.current) return clearInterval(timer);
      postRaw({ ns: NS, v: VERSION, type: "ping", id: makeId(), payload: {} });
    }, PING_INTERVAL_MS);
    return () => {
      window.removeEventListener("message", onMessage);
      clearInterval(timer);
    };
  }, [iframeRef, addLog, postRaw]);

  return { ready, info, picking, lastPick, lastError, log, send, clearError: () => setLastError(null) };
}
