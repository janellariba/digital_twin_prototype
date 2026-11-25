// Top bar: brand, the four views, and system health at a glance.
import TowerIcon from "./TowerIcon.jsx";

export const TABS = ["LIVE", "SIMULATION", "LAB", "SETUP"];

function Pill({ ok, warn, children }) {
  const dot = ok ? "bg-ok" : warn ? "bg-warn" : "bg-fire";
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-line px-2.5 py-1 text-xs font-semibold text-[#c5d0db]">
      <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />{children}
    </span>
  );
}

export default function TopBar({ tab, onTab, serverOk, twinReady, camsOnline, camsTotal, detecting }) {
  return (
    <header className="flex flex-wrap items-center gap-x-7 gap-y-2 border-b border-line bg-[#0e141c] px-5 py-2">
      <div className="flex items-center gap-2.5 text-[15px] font-extrabold tracking-[0.1em]">
        <TowerIcon state="brand" size={20} />AI-SUNOG
      </div>
      <nav className="flex flex-wrap gap-0.5 rounded-xl bg-[#141b24] p-1" aria-label="Views">
        {TABS.map((t) => (
          <button key={t} type="button" onClick={() => onTab(t)} aria-current={tab === t ? "page" : undefined}
            className={`min-h-9 rounded-lg px-4 text-xs font-semibold tracking-[0.08em] ${tab === t
              ? "bg-[#1e2a3b] text-white shadow-[inset_0_-2px_0_#3b82f6]" : "text-muted hover:bg-[#1c2530] hover:text-white"}`}>
            {t}
          </button>
        ))}
      </nav>
      <div className="ml-auto flex flex-wrap items-center gap-2">
        {detecting > 0 && (
          <span className="rounded-full bg-[#3f1220] px-2.5 py-1 text-xs font-bold text-[#fda4af]">
            FIRE/SMOKE: {detecting} camera{detecting > 1 ? "s" : ""}
          </span>
        )}
        <Pill ok={serverOk}>Server</Pill>
        <Pill ok={twinReady} warn={!twinReady}>{twinReady ? "Twin" : "Twin loading"}</Pill>
        <Pill ok={camsTotal > 0 && camsOnline === camsTotal} warn={camsOnline > 0}>{camsOnline} of {camsTotal} cameras online</Pill>
      </div>
    </header>
  );
}
