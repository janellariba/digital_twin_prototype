// Controls drawn over the twin: city overview and layer toggles.
// The twin's own side menu is hidden in the dashboard; these replace it.
import { useState } from "react";

export const LAYER_NAMES = { terrain: "Terrain", buildings: "Buildings", roads: "Roads", sidewalks: "Sidewalks", boundaries: "Barangay boundaries" };

export default function TwinToolbar({ layers, onLayers, onOverview, towersVisible, onTowersVisible }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="absolute left-3 top-3 flex flex-col items-start gap-1.5">
      <div className="flex gap-1.5">
        <button type="button" className="btn bg-[#121821]/90" onClick={onOverview}>City overview</button>
        <button type="button" className="btn bg-[#121821]/90" aria-expanded={open} onClick={() => setOpen((o) => !o)}>Layers</button>
      </div>
      {open && (
        <div className="w-56 rounded-lg border border-line bg-[#121821]/95 p-2.5 text-sm shadow-xl">
          {Object.entries(LAYER_NAMES).map(([k, l]) => (
            <label key={k} className="flex min-h-8 cursor-pointer items-center gap-2">
              <input type="checkbox" className="accent-accent" checked={layers[k]} onChange={(e) => onLayers({ ...layers, [k]: e.target.checked })} />
              {l}
            </label>
          ))}
          <label className="flex min-h-8 cursor-pointer items-center gap-2 border-t border-line pt-1.5">
            <input type="checkbox" className="accent-accent" checked={towersVisible} onChange={(e) => onTowersVisible(e.target.checked)} />
            Watchtowers
          </label>
        </div>
      )}
    </div>
  );
}

export function TwinLegend() {
  const item = (c, l, dashed) => (
    <span className="inline-flex items-center gap-1.5">
      <span className="h-2.5 w-2.5 rounded-full border-2" style={{ borderColor: c, borderStyle: dashed ? "dashed" : "solid" }} />{l}
    </span>
  );
  return (
    <div className="pointer-events-none absolute bottom-3 left-3 flex flex-wrap gap-3 rounded-lg border border-line bg-[#0a0f16]/85 px-3 py-1.5 text-[11.5px] text-[#c5d0db]">
      {item("#34d399", "Online")}{item("#f43f5e", "Detecting")}{item("#94a3b8", "Offline")}{item("#f59e0b", "No camera", true)}
    </div>
  );
}
