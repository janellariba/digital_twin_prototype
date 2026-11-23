// Debug view of the last bridge messages (in, out, queued, rejected). Collapsed by default.
const COLORS = { in: "text-emerald-400", out: "text-sky-400", queued: "text-muted", rejected: "text-red-400" };

export default function MessageLog({ log }) {
  return (
    <details className="rounded-lg border border-line bg-panel p-4">
      <summary className="cursor-pointer text-xs font-semibold uppercase tracking-widest text-muted">Bridge messages (debug)</summary>
      <ul className="mt-3 max-h-64 space-y-1 overflow-y-auto font-mono text-xs">
        {log.length === 0 && <li className="text-muted">No messages yet.</li>}
        {log.map((e) => (
          <li key={e.key} className="flex gap-2">
            <span className="text-muted">{e.time.toLocaleTimeString()}</span>
            <span className={COLORS[e.dir]}>{e.dir.padEnd(3)}</span>
            <span>{e.type}</span>
          </li>
        ))}
      </ul>
    </details>
  );
}
