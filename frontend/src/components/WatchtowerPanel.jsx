// Lists the watchtowers from the config file, shows where each position came
// from (REAL / SYNTHETIC / PENDING), and lets you focus a tower on the map.
const BADGE = {
  REAL: "border-cyan-400 text-cyan-300",
  SYNTHETIC: "border-fuchsia-300 text-fuchsia-300",
  PENDING: "border-amber-500 text-amber-400",
};

export default function WatchtowerPanel({ towers, errors, report, selectedId, visible, onSelect, onReload, onToggle, loading }) {
  const drawn = report?.drawn;
  return (
    <section className="rounded-lg border border-line bg-panel p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-muted">Watchtowers</h2>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1.5 text-xs text-muted">
            <input type="checkbox" className="accent-accent" checked={visible} onChange={(e) => onToggle(e.target.checked)} />
            On map
          </label>
          <button className="text-xs text-muted underline-offset-2 hover:text-ink hover:underline" onClick={onReload} disabled={loading}>
            {loading ? "Loading..." : "Reload"}
          </button>
        </div>
      </div>

      <p className="mb-3 text-xs text-muted">
        {drawn === undefined ? "Updating map..." : `${drawn} of ${towers.length} shown on the map.`}
      </p>

      <ul className="space-y-2">
        {towers.map((t) => {
          const positioned = t.source !== "PENDING";
          const rejected = report?.rejected?.find((r) => r.id === t.id);
          const selected = selectedId === t.id;
          return (
            <li key={t.id}>
              <button
                disabled={!positioned || !!rejected}
                onClick={() => onSelect(t.id)}
                className={`w-full rounded-md border px-3 py-2 text-left transition-colors ${
                  selected ? "border-cyan-400 bg-cyan-400/10" : "border-line hover:border-accent"
                } disabled:cursor-default disabled:hover:border-line`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold">
                    {t.id} <span className="font-normal text-muted">{t.name}</span>
                  </span>
                  <span className={`rounded-full border px-2 py-0.5 font-mono text-[10px] ${BADGE[t.source]}`}>{t.source}</span>
                </div>
                <div className="mt-1 font-mono text-xs text-muted">
                  {positioned ? `${t.lat.toFixed(6)}, ${t.lon.toFixed(6)}` : "Position pending: not drawn"}
                </div>
                {t.source === "SYNTHETIC" && (
                  <div className="mt-1 text-[11px] text-fuchsia-300/80">Temporary test position. Replace with surveyed value.</div>
                )}
                {rejected && <div className="mt-1 text-[11px] text-red-400">Not drawn: {rejected.reason}</div>}
              </button>
            </li>
          );
        })}
      </ul>

      {errors.length > 0 && (
        <div className="mt-3 rounded-md border border-red-500/50 bg-red-500/10 p-2 text-xs text-red-300">
          <p className="mb-1 font-semibold">Config problems (entries skipped):</p>
          <ul className="list-inside list-disc space-y-0.5">
            {errors.map((e) => <li key={e}>{e}</li>)}
          </ul>
        </div>
      )}

      <p className="mt-3 text-[11px] text-muted">
        Edit <code className="font-mono">server/config/watchtowers.json</code>, then click Reload.
      </p>
    </section>
  );
}
