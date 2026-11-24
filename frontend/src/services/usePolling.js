// Calls fn() every intervalMs and keeps the latest result (or error).
import { useEffect, useState } from "react";

export function usePolling(fn, intervalMs, initial) {
  const [data, setData] = useState(initial);
  const [error, setError] = useState(null);
  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try {
        const d = await fn();
        if (alive) { setData(d); setError(null); }
      } catch (e) {
        if (alive) setError(e.message);
      }
    };
    tick();
    const t = setInterval(tick, intervalMs);
    return () => { alive = false; clearInterval(t); };
  }, [fn, intervalMs]);
  return [data, error];
}
