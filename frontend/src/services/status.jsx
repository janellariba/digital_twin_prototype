// Display status for cameras and towers, derived from what the server reports.
// A tower's status comes from the cameras linked to it (camera.watchtower_id).

// Per camera: detecting | online | error | offline
export function camState(cam) {
  if (cam.detecting) return "detecting";
  if (cam.state === "ONLINE") return "online";
  if (cam.state === "ERROR") return "error";
  return "offline";
}

// Per tower: detecting | online | offline | nolink (no camera linked yet)
export function towerState(cams) {
  if (!cams.length) return "nolink";
  const s = cams.map(camState);
  if (s.includes("detecting")) return "detecting";
  if (s.includes("online")) return "online";
  return "offline";
}

export const STATE_LABEL = {
  detecting: "DETECTING", online: "ONLINE", offline: "OFFLINE", error: "ERROR", nolink: "NO CAMERA",
};

export const STATE_BADGE = {
  detecting: "bg-[#3f1220] text-[#fda4af]",
  online: "bg-[#0f3326] text-[#6ee7b7]",
  offline: "bg-[#1e252e] text-[#a3afbc]",
  error: "bg-[#3a2a0c] text-[#fbbf24]",
  nolink: "bg-[#3a2a0c] text-[#fbbf24]",
};

export function StateBadge({ state, children }) {
  return (
    <span className={`whitespace-nowrap rounded-md px-2 py-0.5 text-[10.5px] font-bold tracking-[0.08em] ${STATE_BADGE[state]}`}>
      {children ?? STATE_LABEL[state]}
    </span>
  );
}

// Group cameras by tower: { byTower: Map(towerId -> cams[]), unlinked: cams[] }.
// A camera linked to a tower that no longer exists is treated as unlinked.
export function groupCameras(towers, cameras) {
  const ids = new Set(towers.map((t) => t.id));
  const byTower = new Map(towers.map((t) => [t.id, []]));
  const unlinked = [];
  for (const c of cameras) {
    if (c.watchtower_id && ids.has(c.watchtower_id)) byTower.get(c.watchtower_id).push(c);
    else unlinked.push(c);
  }
  return { byTower, unlinked };
}

const ORDER = { detecting: 0, online: 1, error: 2, offline: 3 };
export const byUrgency = (a, b) => ORDER[camState(a)] - ORDER[camState(b)] || a.id.localeCompare(b.id);
