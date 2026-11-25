// LAB: the three webcams used for the room triangulation test (Step 3B).
// Shows every camera registered with site "lab" and what is still needed.
import CameraFeed from "../components/CameraFeed.jsx";
import { StateBadge } from "../services/status.jsx";

const NEEDED = [
  ["Room corner chosen as origin (0, 0)", "NOT MEASURED"],
  ["Each webcam position from the corner (tape)", "NOT MEASURED"],
  ["Each webcam heading", "NOT MEASURED"],
  ["Webcam field of view (A4Tech model or tape method)", "NEEDS MODEL"],
  ["Fire screen true position (to measure the error)", "NOT MEASURED"],
];

export default function LabView({ cameras }) {
  const lab = cameras.filter((c) => c.site === "lab");
  return (
    <div className="flex flex-wrap gap-3.5">
      <section className="card min-w-0 flex-[999_1_640px]">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="h-label">Lab webcams</h2>
          <span className="text-[12px] text-muted">{lab.length} registered with site "lab"</span>
        </div>
        {!lab.length && <p className="text-sm text-muted">No lab camera running. Start them with camera_node\start_lab_nodes.ps1.</p>}
        <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-3">
          {lab.map((c) => <CameraFeed key={c.id} cam={c} />)}
        </div>
      </section>
      <aside className="flex min-w-0 flex-[1_1_320px] flex-col gap-3.5 lg:max-w-[400px]">
        <section className="card">
          <h2 className="h-label mb-2.5">Needed before lab triangulation</h2>
          <ul className="flex flex-col gap-2 text-[13px]">
            {NEEDED.map(([k, v]) => (
              <li key={k} className="flex items-center justify-between gap-3"><span>{k}</span><StateBadge state="nolink">{v}</StateBadge></li>
            ))}
          </ul>
          <p className="mt-3 text-[12px] text-muted">The room diagram and the triangulated estimate come in Step 3B, once these are measured.</p>
        </section>
      </aside>
    </div>
  );
}
