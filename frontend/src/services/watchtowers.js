// Watchtowers now come from the server (database), which syncs them from
// server/config/watchtowers.json. The dashboard still validates what it gets
// before drawing anything.
import { api } from "./api.js";

export const SOURCES = ["REAL", "SYNTHETIC", "PENDING"];
const ID_RE = /^[A-Za-z0-9_-]{1,16}$/;
const isNum = (x) => typeof x === "number" && Number.isFinite(x);

// Returns { towers, errors }. Invalid entries are listed in errors and left out.
export function validateWatchtowers(data) {
  const errors = [];
  if (!data || typeof data !== "object") return { towers: [], errors: ["Response is not a JSON object."] };
  if (data.schema_version !== 1) errors.push(`Unsupported schema_version: ${data.schema_version}`);
  if (!Array.isArray(data.towers)) return { towers: [], errors: [...errors, "Missing 'towers' list."] };

  const seen = new Set();
  const towers = [];
  data.towers.forEach((t, i) => {
    const where = `Tower #${i + 1}`;
    if (!t || typeof t !== "object") return errors.push(`${where}: not an object.`);
    if (typeof t.id !== "string" || !ID_RE.test(t.id)) return errors.push(`${where}: invalid id.`);
    if (seen.has(t.id)) return errors.push(`${t.id}: duplicate id.`);
    seen.add(t.id);
    if (!SOURCES.includes(t.source)) return errors.push(`${t.id}: invalid source.`);
    if (t.source !== "PENDING" && (!isNum(t.lat) || !isNum(t.lon))) return errors.push(`${t.id}: missing lat/lon.`);
    towers.push({
      id: t.id,
      name: typeof t.name === "string" ? t.name : "",
      site: typeof t.site === "string" ? t.site : null,
      lat: t.source === "PENDING" ? null : t.lat,
      lon: t.source === "PENDING" ? null : t.lon,
      source: t.source,
      notes: typeof t.notes === "string" ? t.notes : "",
    });
  });
  return { towers, errors };
}

function unpack(data) {
  const { towers, errors } = validateWatchtowers(data);
  const fileErrors = Array.isArray(data?.file_errors) ? data.file_errors.map(String) : [];
  return { towers, errors: [...fileErrors, ...errors] };
}

export async function loadWatchtowers() {
  return unpack(await api.get("/api/watchtowers"));
}

// Asks the server to re-read server/config/watchtowers.json, then returns the list.
export async function reloadWatchtowers() {
  return unpack(await api.post("/api/watchtowers/reload"));
}
