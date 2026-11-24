// Recent AI detections from the camera nodes (source_type "ai"), newest first.
const fmtTime = (iso) => new Date(iso).toLocaleTimeString();

export default function DetectionPanel({ detections, error }) {
  return (
    <section className="rounded-lg border border-line bg-panel p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-muted">AI detections</h2>
        <span className="rounded-full border border-cyan-400 px-2 py-0.5 font-mono text-[10px] text-cyan-300">CAMERAS</span>
      </div>
      {error && <p className="text-xs text-red-400">{error}</p>}
      {!error && detections.length === 0 && <p className="text-xs text-muted">No detections yet.</p>}
      <ul className="max-h-80 space-y-2 overflow-y-auto">
        {detections.map((d) => (
          <li key={d.id} className="flex gap-2 rounded-md border border-line p-2">
            {d.snapshot_url ? (
              <a href={d.snapshot_url} target="_blank" rel="noreferrer" className="shrink-0">
                <img src={d.snapshot_url} alt="snapshot" className="h-14 w-20 rounded object-cover" loading="lazy" />
              </a>
            ) : (
              <div className="h-14 w-20 shrink-0 rounded bg-black" />
            )}
            <div className="min-w-0 text-xs">
              <div className="font-semibold">
                {d.camera_id} <span className="text-red-300">{d.classes.join(" + ")}</span>
              </div>
              <div className="font-mono text-muted">{fmtTime(d.captured_at)} · max {Math.round(d.max_confidence * 100)}%</div>
              <div className="truncate font-mono text-muted">
                {d.boxes.map((b) => `${b.class_name} ${Math.round(b.confidence * 100)}%`).join(", ")}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
