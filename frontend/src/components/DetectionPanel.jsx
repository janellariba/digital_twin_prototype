// Recent AI detections (source_type "ai"), newest first, with the tower each camera is on.
// Clicking one opens that camera in the Camera view.
const fmtTime = (iso) => new Date(iso).toLocaleTimeString();

export default function DetectionPanel({ detections, error, cameraTower, onSelectCamera }) {
  return (
    <section className="card">
      <div className="mb-2.5 flex items-center justify-between">
        <h2 className="h-label">Recent detections</h2>
        <span className="rounded-md border border-[#1f6b62] px-2 py-0.5 text-[10.5px] font-bold tracking-wider text-[#5eead4]">AI</span>
      </div>
      {error && <p className="text-xs text-fire">{error}</p>}
      {!error && detections.length === 0 && <p className="text-sm text-muted">No detections yet.</p>}
      <ul className="flex max-h-[520px] flex-col gap-2 overflow-y-auto">
        {detections.map((d) => (
          <li key={d.id}>
            <button type="button" onClick={() => onSelectCamera?.(d.camera_id)}
              className="flex w-full gap-2.5 rounded-lg border border-[#1b2430] bg-panel2 p-2 text-left hover:border-[#334155]">
              {d.snapshot_url
                ? <img src={d.snapshot_url} alt="" className="h-12 w-20 shrink-0 rounded object-cover" loading="lazy" />
                : <div className="h-12 w-20 shrink-0 rounded bg-black" />}
              <span className="min-w-0 text-xs">
                <span className="block font-semibold">
                  {d.camera_id} <span className="text-muted">{cameraTower(d.camera_id) ?? "not linked"}</span>
                </span>
                <span className="block text-[#fda4af]">{d.classes.join(" + ")} {Math.round(d.max_confidence * 100)}%</span>
                <span className="block font-mono text-muted">{fmtTime(d.captured_at)}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
