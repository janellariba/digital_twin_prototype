/* BEGIN AI-SUNOG BRIDGE v1 */
/*
  AI-SUNOG bridge for the Muntinlupa digital twin.

  This block is injected by digital-twin/build_twin.py at the end of the twin's
  module script, so it can see the twin's internal (minified) variables:
    Be  = three.js scene          sn = camera        an = renderer
    rn  = (E, N, h) -> [x, y, z]  Fi = DEM height    a_ = lat/lon -> UTM 51N
    eh, nh = origin_utm           Un = DEM metadata  ih = fly-to
    Br, zr = raycaster + pointer  ms = terrain mesh  Fr = buildings mesh
    mn = Group, pe = Mesh, Sr = CylinderGeometry, xn = MeshBasicMaterial

  It adds a postMessage API for the React dashboard. It does not change any
  existing layer, control or the CSV camera loader. It only adds its own group.
*/
{
  const NS = "ai-sunog-twin";
  const VERSION = 1;
  const ORIGIN = location.origin;
  const EMBEDDED = window.parent !== window;

  // Twin extent in local metres, read from the twin's own DEM metadata.
  const EXT = {
    minE: Un.left,
    maxE: Un.left + Un.w * Un.res,
    minN: Un.top - Un.h * Un.res,
    maxN: Un.top,
  };

  /* BEGIN utmToLatLon */
  // Inverse Transverse Mercator, WGS84, UTM zone 51N (central meridian 123 E).
  // Inverse of the twin's own a_() function. Used for display only; the server
  // will use pyproj as the authority for all geodesy.
  function utmToLatLon(E, N) {
    const a = 6378137, f = 1 / 298.257223563, k0 = 0.9996;
    const e2 = f * (2 - f), ep2 = e2 / (1 - e2), lon0 = (123 * Math.PI) / 180;
    const x = E - 500000, y = N;
    const mu = y / k0 / (a * (1 - e2 / 4 - (3 * e2 * e2) / 64 - (5 * e2 ** 3) / 256));
    const e1 = (1 - Math.sqrt(1 - e2)) / (1 + Math.sqrt(1 - e2));
    const p1 = mu
      + ((3 * e1) / 2 - (27 * e1 ** 3) / 32) * Math.sin(2 * mu)
      + ((21 * e1 * e1) / 16 - (55 * e1 ** 4) / 32) * Math.sin(4 * mu)
      + ((151 * e1 ** 3) / 96) * Math.sin(6 * mu)
      + ((1097 * e1 ** 4) / 512) * Math.sin(8 * mu);
    const s = Math.sin(p1), c = Math.cos(p1), t = Math.tan(p1);
    const N1 = a / Math.sqrt(1 - e2 * s * s);
    const T1 = t * t, C1 = ep2 * c * c;
    const R1 = (a * (1 - e2)) / Math.pow(1 - e2 * s * s, 1.5);
    const D = x / (N1 * k0);
    const lat = p1 - ((N1 * t) / R1) * (
      (D * D) / 2
      - ((5 + 3 * T1 + 10 * C1 - 4 * C1 * C1 - 9 * ep2) * D ** 4) / 24
      + ((61 + 90 * T1 + 298 * C1 + 45 * T1 * T1 - 252 * ep2 - 3 * C1 * C1) * D ** 6) / 720);
    const lon = lon0 + (
      D
      - ((1 + 2 * T1 + C1) * D ** 3) / 6
      + ((5 - 2 * C1 + 28 * T1 - 3 * C1 * C1 + 8 * ep2 + 24 * T1 * T1) * D ** 5) / 120) / c;
    return [(lat * 180) / Math.PI, (lon * 180) / Math.PI];
  }
  /* END utmToLatLon */

  const finite = (...xs) => xs.every((x) => typeof x === "number" && Number.isFinite(x));
  const inExtent = (e, n) => e >= EXT.minE && e <= EXT.maxE && n >= EXT.minN && n <= EXT.maxN;

  function send(type, payload = {}, id = null) {
    if (EMBEDDED) window.parent.postMessage({ ns: NS, v: VERSION, type, id, payload }, ORIGIN);
  }
  function fail(message, id = null) {
    console.warn("[AI-SUNOG bridge]", message);
    send("error", { message }, id);
  }
  const readyPayload = () => ({
    bridge_version: VERSION,
    crs: "EPSG:32651",
    origin_utm: [eh, nh],
    extent_local: EXT,
  });

  // Bridge layer: everything the bridge draws lives here, separate from the
  // twin's own layers.
  const layer = new mn();
  layer.name = "aisunog-bridge";
  Be.add(layer);

  // Pick marker: a magenta pin. Size is display only.
  let pin = null;
  function clearPin() {
    if (!pin) return;
    layer.remove(pin);
    pin.geometry.dispose();
    pin.material.dispose();
    pin = null;
  }
  function setPin(e, n, baseElev) {
    clearPin();
    const h = 200; // display size only
    pin = new pe(new Sr(15, 15, h, 16), new xn({ color: 0xff3df2 }));
    pin.position.set(...rn(e, n, baseElev + h / 2));
    layer.add(pin);
  }

  // Click-to-pick. Armed by "pick.start", answered once with "pick.result".
  let pickId = null;
  let down = null;
  const canvas = an.domElement;
  const disarm = () => { pickId = null; canvas.style.cursor = ""; };

  canvas.addEventListener("pointerdown", (ev) => { down = [ev.clientX, ev.clientY]; });
  canvas.addEventListener("pointerup", (ev) => {
    // Ignore drags (camera moves), same 4 px rule the twin uses.
    if (pickId === null || !down || Math.hypot(ev.clientX - down[0], ev.clientY - down[1]) > 4) return;
    const r = canvas.getBoundingClientRect();
    zr.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
    Br.setFromCamera(zr, sn);
    const targets = [Fr, ms].filter((o) => o && o.visible);
    const hit = Br.intersectObjects(targets, false)[0];
    const id = pickId;
    if (!hit) return send("pick.miss", { reason: "Nothing under the cursor. Click on terrain or a building." }, id);
    const e = hit.point.x, n = -hit.point.z, elev = hit.point.y;
    if (!inExtent(e, n)) return send("pick.miss", { reason: "Outside the digital twin extent." }, id);
    const [lat, lon] = utmToLatLon(e + eh, n + nh);
    setPin(e, n, elev);
    disarm();
    send("pick.result", {
      lat, lon,
      utm_e: e + eh, utm_n: n + nh,
      local_e: e, local_n: n,
      elev_m: elev,
      ground_elev_m: Fi(e, n),
      hit: hit.object === Fr ? "building" : "terrain",
    }, id);
  });
  addEventListener("keydown", (ev) => {
    if (ev.key === "Escape" && pickId !== null) { const id = pickId; disarm(); send("pick.cancelled", {}, id); }
  });

  // Allowed message types from the dashboard. Anything else is rejected.
  const HANDLERS = {
    "ping": (p, id) => send("twin.ready", readyPayload(), id),
    "pick.start": (p, id) => { pickId = id ?? "pick"; canvas.style.cursor = "crosshair"; send("pick.armed", {}, id); },
    "pick.cancel": (p, id) => { disarm(); send("pick.cancelled", {}, id); },
    "marker.clear": (p, id) => { clearPin(); send("marker.cleared", {}, id); },
    "view.flyTo": (p, id) => {
      const lat = p.lat, lon = p.lon, d = p.distance_m === undefined ? 2600 : p.distance_m;
      if (!finite(lat, lon, d)) return fail("view.flyTo needs numeric lat, lon and optional distance_m", id);
      if (d < 200 || d > 20000) return fail("distance_m must be between 200 and 20000", id);
      const [E, N] = a_(lat, lon);
      const e = E - eh, n = N - nh;
      if (!inExtent(e, n)) return fail("That point is outside the digital twin extent", id);
      ih(e, n, d);
      send("view.flying", { lat, lon, distance_m: d }, id);
    },
  };

  addEventListener("message", (ev) => {
    // Only the embedding page, on the same origin, may talk to the bridge.
    if (ev.source !== window.parent || ev.origin !== ORIGIN) return;
    const m = ev.data;
    if (!m || typeof m !== "object" || m.ns !== NS) return;
    const id = typeof m.id === "string" ? m.id.slice(0, 64) : null;
    if (m.v !== VERSION) return fail(`Unsupported message version: ${String(m.v).slice(0, 10)}`, id);
    const handler = typeof m.type === "string" && Object.hasOwn(HANDLERS, m.type) ? HANDLERS[m.type] : null;
    if (!handler) return fail(`Unknown message type: ${String(m.type).slice(0, 40)}`, id);
    const payload = m.payload && typeof m.payload === "object" ? m.payload : {};
    try { handler(payload, id); } catch (err) { fail(`Handler failed: ${err.message}`, id); }
  });

  send("twin.ready", readyPayload());
  console.info("[AI-SUNOG bridge] ready", EMBEDDED ? "(embedded)" : "(standalone, messaging off)");
}
/* END AI-SUNOG BRIDGE */
