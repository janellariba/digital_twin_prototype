// Small live preview: polls the camera's latest JPEG. Shows a placeholder when offline.
import { useEffect, useState } from "react";

export default function LiveThumb({ cam, refreshMs = 1000, className = "", fit = "cover", alt = "" }) {
  const [tick, setTick] = useState(0);
  const [ok, setOk] = useState(false);
  const live = cam.state !== "OFFLINE";
  useEffect(() => {
    if (!live) return;
    const t = setInterval(() => setTick((n) => n + 1), refreshMs);
    return () => clearInterval(t);
  }, [live, refreshMs]);
  return (
    <div className={`relative overflow-hidden rounded-md bg-black ${className}`}>
      {live && (
        <img src={`/api/cameras/${encodeURIComponent(cam.id)}/frame.jpg?t=${tick}`} alt={alt}
          className={`h-full w-full ${fit === "contain" ? "object-contain" : "object-cover"} ${ok ? "" : "invisible"}`}
          onLoad={() => setOk(true)} onError={() => setOk(false)} />
      )}
      {(!live || !ok) && (
        <div className="absolute inset-0 flex items-center justify-center bg-[repeating-linear-gradient(135deg,#141a22_0_8px,#10151c_8px_16px)] text-[10px] font-semibold tracking-wider text-muted">
          {live ? "..." : "OFFLINE"}
        </div>
      )}
    </div>
  );
}
