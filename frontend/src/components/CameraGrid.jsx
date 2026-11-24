// Camera strip above the map: one card per registered camera node.
import CameraFeed from "./CameraFeed.jsx";

export default function CameraGrid({ cameras, error }) {
  if (error) {
    return <div className="rounded-lg border border-red-500/50 bg-red-500/10 p-3 text-xs text-red-300">Cameras: {error}</div>;
  }
  if (cameras.length === 0) {
    return (
      <div className="rounded-lg border border-line bg-panel p-3 text-xs text-muted">
        No cameras yet. Start a camera node: <code className="font-mono">python -m node --config config/LAB-A.json</code> (see README).
      </div>
    );
  }
  return (
    <div className="grid grid-cols-3 gap-3">
      {cameras.map((c) => <CameraFeed key={c.id} cam={c} />)}
    </div>
  );
}
