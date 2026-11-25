// Watchtower pin icon (same design as the 3D twin marker in twin-bridge.js).
// The pin tip is the tower position; the corner chip counts linked cameras.
const COLOR = { online: "#34d399", detecting: "#f43f5e", offline: "#94a3b8", nolink: "#f59e0b", brand: "#60a5fa" };

export default function TowerIcon({ state = "offline", count = null, size = 40, title }) {
  const c = COLOR[state] ?? COLOR.offline;
  const glyph = state === "offline" ? "#cbd5e1" : "#ffffff";
  return (
    <svg width={size} height={size * 1.25} viewBox="0 0 48 60" role={title ? "img" : undefined}
      aria-label={title} aria-hidden={title ? undefined : true} className="shrink-0">
      {state === "detecting" && (
        <circle cx="24" cy="22" r="23" fill={c} fillOpacity=".18" className="origin-[24px_22px] animate-pulse" />
      )}
      <path d="M24 58.5C24 58.5 4.5 37.5 4.5 22.5a19.5 19.5 0 0 1 39 0C43.5 37.5 24 58.5 24 58.5Z" fill="#0e151d"
        stroke={c} strokeWidth="2.6" strokeDasharray={state === "nolink" ? "4 3" : undefined} />
      <circle cx="24" cy="22.5" r="14.5" fill={c} fillOpacity=".16" />
      <g fill="none" stroke={glyph} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <path d="M18.6 33.5L22 16.5M29.4 33.5L26 16.5" />
        <path d="M19.4 29.5h9.2M20.3 25h7.4M21.1 20.8h5.8" />
        <path d="M19.4 29.5L27.7 25M28.6 29.5L20.3 25M20.3 25L26.9 20.8M27.7 25L21.1 20.8" />
        <path d="M24 12.2V8.6" />
      </g>
      <rect x="20.3" y="12.2" width="7.4" height="4.6" rx="1.3" fill={glyph} />
      <circle cx="24" cy="14.5" r="1.35" fill={c} />
      {state === "detecting" && (
        <path d="M15.5 8.5a11 11 0 0 1 3.5-4.2M32.5 8.5a11 11 0 0 0-3.5-4.2" fill="none" stroke={c} strokeWidth="1.8" strokeLinecap="round" />
      )}
      {count !== null && (
        <g>
          <circle cx="40" cy="8" r="7.2" fill={c} stroke="#0e151d" strokeWidth="2" />
          <text x="40" y="11.2" fontSize="9.5" fontWeight="800" textAnchor="middle" fill="#0b0f14">{count > 0 ? count : "!"}</text>
        </g>
      )}
    </svg>
  );
}
