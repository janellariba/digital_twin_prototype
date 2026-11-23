// Loads and validates the watchtower config file at runtime (not bundled into
// the app), so you can edit coordinates and click Reload without rebuilding.
// In Step 2 this moves to the backend API and database.

export const WATCHTOWERS_URL =
  import.meta.env.VITE_WATCHTOWERS_URL ?? `${import.meta.env.BASE_URL}config/watchtowers.json`;

export const SOURCES = ["REAL", "SYNTHETIC", "PENDING"];
const ID_RE = /^[A-Za-z0-9_-]{1,16}$/;
const isNum = (x) => typeof x === "number" && Number.isFinite(x);

// Returns { towers, errors }. Invalid entries are listed in errors and left out.
export function validateWatchtowers(data) {
  const errors = [];
  if (!data || typeof data !== "object") return { towers: [], errors: ["File is not a JSON object."] };
  if (data.schema_version !== 1) errors.push(`Unsupported schema_version: ${data.schema_version}`);
  if (!Array.isArray(data.towers)) return { towers: [], errors: [...errors, "Missing 'towers' list."] };

  const seen = new Set();
  const towers = [];
  data.towers.forEach((t, i) => {
    const where = `Tower #${i + 1}`;
    if (!t || typeof t !== "object") return errors.push(`${where}: not an object.`);
    if (typeof t.id !== "string" || !ID_RE.test(t.id)) return errors.push(`${where}: id must be 1 to 16 letters, digits, - or _.`);
    if (seen.has(t.id)) return errors.push(`${t.id}: duplicate id.`);
    seen.add(t.id);
    if (!SOURCES.includes(t.source)) return errors.push(`${t.id}: source must be REAL, SYNTHETIC or PENDING.`);

    if (t.source === "PENDING") {
      if (t.lat != null || t.lon != null) return errors.push(`${t.id}: PENDING towers must have lat and lon set to null.`);
    } else {
      if (!isNum(t.lat) || !isNum(t.lon)) return errors.push(`${t.id}: ${t.source} towers need numeric lat and lon.`);
      if (Math.abs(t.lat) > 90 || Math.abs(t.lon) > 180) return errors.push(`${t.id}: lat/lon out of range.`);
    }
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

export async function loadWatchtowers(url = WATCHTOWERS_URL) {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Could not load ${url} (HTTP ${res.status})`);
  let data;
  try {
    data = await res.json();
  } catch {
    throw new Error(`${url} is not valid JSON. Check for missing commas or quotes.`);
  }
  return validateWatchtowers(data);
}
