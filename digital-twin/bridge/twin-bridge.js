/* BEGIN AI-SUNOG BRIDGE v1 */
/*
  AI-SUNOG bridge for the Muntinlupa digital twin.

  This block is injected by digital-twin/build_twin.py at the end of the twin's
  module script, so it can see the twin's internal (minified) variables:
    Be  = three.js scene          sn = camera        an = renderer
    rn  = (E, N, h) -> [x, y, z]  Fi = DEM height    a_ = lat/lon -> UTM 51N
    eh, nh = origin_utm           Un = DEM metadata  ih = fly-to
    Br, zr = raycaster + pointer  ms = terrain mesh  Fr = buildings mesh
    mn = Group, pe = Mesh, Sr = CylinderGeometry, xn = MeshBasicMaterial,
    os = Shape, br = ShapeGeometry, P = Vector3, Ge = DoubleSide,
    gr = Line, rs = LineBasicMaterial, _e = BufferGeometry

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


  // -------------------------------------------------------------------------
  // DISPLAY STYLE. Visual constants only: marker sizes (metres at close zoom),
  // colours and zoom scaling. None of these affect coordinates or any
  // calculation. Tower positions always come from the dashboard's config.
  // -------------------------------------------------------------------------
  const STYLE = {
    // Tower data source changes only the label badge and opacity.
    tower: {
      REAL: { mast: 0xe2e8f0, opacity: 1 },
      SYNTHETIC: { mast: 0xe2e8f0, opacity: 0.8 },
    },
    // Tower status colours (ring + pin). Status comes from the dashboard, which
    // derives it from the cameras linked to each tower.
    towerState: { online: 0x34d399, detecting: 0xf43f5e, offline: 0x94a3b8, nolink: 0xf59e0b },
    pick: 0xffffff,
    mastH: 40, mastR: 1.6, headH: 10, headR: 12, ringIn: 14, ringOut: 20,
    labelLift: 14,
    // Markers grow when zoomed out so they stay visible at city scale.
    zoomRef: 1200, zoomMin: 1, zoomMax: 10,
    towerFlyDistance: 1800,
    // Simulation drawing (display only).
    sim: { truth: 0xff5a36, ray: 0xfb923c, estimate: 0xfacc15, ellipseOpacity: 0.22, dashOn: 120, dashOff: 70, rayLift: 12, flyDistance: 6000 },
  };

  const css = document.createElement("style");
  css.textContent = `
.aisunog-tw{position:fixed;transform:translate(-50%,-100%);pointer-events:none;text-align:center;white-space:nowrap;text-shadow:0 1px 3px #000,0 0 8px #000}
.aisunog-tw b{display:block;font:700 15px/1 var(--display);letter-spacing:.06em;color:#fff}
.aisunog-tw span{display:block;font:500 11px/1.3 var(--body);color:#cfe0dc}
.aisunog-tw i{display:inline-block;margin-top:3px;font:600 9.5px/1 var(--mono);font-style:normal;letter-spacing:.06em;padding:2px 6px;border-radius:99px;border:1px solid currentColor;text-shadow:none;background:rgba(13,20,23,.85)}
.aisunog-tw.real i{color:#22d3ee}.aisunog-tw.synthetic i{color:#f0abfc}.aisunog-tw.pick i{color:#fff}
.aisunog-tw.simfire i{color:#ff7a50}.aisunog-tw.estimate i{color:#facc15}
.aisunog-tw.sel b{color:#60a5fa}
.aisunog-tw .pin{display:block;width:34px;height:42px;margin:3px auto 0;--c:#94a3b8;transition:transform .15s}
.aisunog-tw.sel .pin{transform:scale(1.22);transform-origin:50% 100%}
.aisunog-tw.st-online .pin{--c:#34d399}.aisunog-tw.st-detecting .pin{--c:#f43f5e}
.aisunog-tw.st-offline .pin{--c:#94a3b8}.aisunog-tw.st-nolink .pin{--c:#f59e0b}
.aisunog-tw .pin .o{stroke:var(--c)}.aisunog-tw .pin .f{fill:var(--c)}
.aisunog-tw .pin .halo,.aisunog-tw .pin .arcs{display:none}
.aisunog-tw.st-detecting .pin .halo{display:block;animation:aisunog-pulse 1.4s ease-out infinite;transform-origin:24px 22px}
.aisunog-tw.st-detecting .pin .arcs{display:block}
.aisunog-tw.st-nolink .pin .o{stroke-dasharray:4 3}
.aisunog-tw.st-offline .pin .g{stroke:#cbd5e1}.aisunog-tw.st-offline .pin .gf{fill:#cbd5e1}
@keyframes aisunog-pulse{0%{opacity:.55;transform:scale(.8)}100%{opacity:0;transform:scale(1.35)}}`;
  // Embedded in the dashboard: hide the twin's own side menu. The dashboard
  // has its own layer controls (layers.set). Standalone use is unchanged.
  if (EMBEDDED) css.textContent += "\n.rail{display:none!important}";
  document.head.appendChild(css);

  // Bridge layer: everything the bridge draws lives here, separate from the
  // twin's own layers (terrain, buildings, roads, barangays, CSV cameras).
  const layer = new mn();
  layer.name = "aisunog-bridge";
  Be.add(layer);
  const towerLayer = new mn();
  towerLayer.name = "aisunog-watchtowers";
  layer.add(towerLayer);

  const disposeTree = (obj) => obj.traverse((o) => { o.geometry?.dispose(); o.material?.dispose(); });

  // Flat ring lying on the ground. Drawn on top of everything so the exact
  // location is never hidden behind buildings.
  function ringMesh(color, opacity) {
    const s = new os();
    s.absarc(0, 0, STYLE.ringOut, 0, Math.PI * 2, false);
    const hole = new os();
    hole.absarc(0, 0, STYLE.ringIn, 0, Math.PI * 2, true);
    s.holes.push(hole);
    const g = new br(s, 48);
    g.rotateX(-Math.PI / 2);
    const m = new pe(g, new xn({ color, transparent: true, opacity, depthTest: false, depthWrite: false, side: Ge }));
    m.renderOrder = 10;
    return m;
  }

  // Watchtower pin icon. Static markup written here (no config text), so
  // innerHTML is safe; the camera count is set with textContent.
  const PIN_SVG =
    '<svg class="pin" viewBox="0 0 48 60" aria-hidden="true">' +
    '<circle class="halo f" cx="24" cy="22" r="22" fill-opacity=".35"/>' +
    '<path class="o" d="M24 58.5C24 58.5 4.5 37.5 4.5 22.5a19.5 19.5 0 0 1 39 0C43.5 37.5 24 58.5 24 58.5Z" fill="#0e151d" stroke-width="2.6"/>' +
    '<circle class="f" cx="24" cy="22.5" r="14.5" fill-opacity=".18"/>' +
    '<g class="g" fill="none" stroke="#fff" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">' +
    '<path d="M18.6 33.5L22 16.5M29.4 33.5L26 16.5"/><path d="M19.4 29.5h9.2M20.3 25h7.4M21.1 20.8h5.8"/>' +
    '<path d="M19.4 29.5L27.7 25M28.6 29.5L20.3 25M20.3 25L26.9 20.8M27.7 25L21.1 20.8"/><path d="M24 12.2V8.6"/></g>' +
    '<rect class="gf" x="20.3" y="12.2" width="7.4" height="4.6" rx="1.3" fill="#fff"/>' +
    '<path class="arcs o" d="M15.5 8.5a11 11 0 0 1 3.5-4.2M32.5 8.5a11 11 0 0 0-3.5-4.2" fill="none" stroke-width="1.8" stroke-linecap="round"/>' +
    '<circle class="f" cx="40" cy="8" r="7.2" stroke="#0e151d" stroke-width="2"/>' +
    '<text class="n" x="40" y="11.2" font-size="9.5" font-weight="800" text-anchor="middle" fill="#0b0f14" font-family="system-ui,sans-serif"></text>' +
    "</svg>";

  // A marker = ground ring (exact spot) + optional mast + HTML label (and pin icon for towers).
  const markers = new Set();
  function makeMarker({ e, n, color, mastColor, opacity, title, sub, badge, cls, withMast, pin }) {
    const group = new mn();
    const ground = Fi(e, n);
    group.position.set(...rn(e, n, ground));
    group.add(ringMesh(color, Math.min(1, opacity + 0.25)));
    let top = 0;
    if (withMast) {
      const mat = (c) => new xn({ color: c, transparent: opacity < 1, opacity });
      const mast = new pe(new Sr(STYLE.mastR, STYLE.mastR, STYLE.mastH, 8), mat(mastColor));
      mast.position.y = STYLE.mastH / 2;
      group.add(mast);
      top = STYLE.mastH;
      if (!pin) {
        const head = new pe(new Sr(STYLE.headR, STYLE.headR, STYLE.headH, 6), mat(color));
        head.position.y = STYLE.mastH + STYLE.headH / 2;
        group.add(head);
        top += STYLE.headH;
      }
    }
    // Label built with textContent only (never innerHTML) so config text cannot inject HTML.
    const el = document.createElement("div");
    el.className = "aisunog-tw " + cls;
    const b = document.createElement("b"); b.textContent = title; el.appendChild(b);
    if (sub) { const s = document.createElement("span"); s.textContent = sub; el.appendChild(s); }
    if (badge) { const i = document.createElement("i"); i.textContent = badge; el.appendChild(i); }
    let count = null;
    if (pin) {
      const w = document.createElement("div");
      w.innerHTML = PIN_SVG;
      el.appendChild(w.firstChild);
      count = el.querySelector("text.n");
    }
    document.body.appendChild(el);
    const mk = { group, el, top, e, n, count };
    markers.add(mk);
    return mk;
  }
  function removeMarker(mk) {
    mk.group.parent?.remove(mk.group);
    disposeTree(mk.group);
    mk.el.remove();
    markers.delete(mk);
  }
  const shown = (o) => { for (let x = o; x; x = x.parent) if (!x.visible) return false; return true; };

  // Keep marker size and label positions in step with the camera.
  const tmp = new P();
  function frame() {
    for (const mk of markers) {
      const s = Math.min(STYLE.zoomMax, Math.max(STYLE.zoomMin, sn.position.distanceTo(mk.group.position) / STYLE.zoomRef));
      mk.group.scale.setScalar(s);
      tmp.copy(mk.group.position);
      tmp.y += (mk.top + STYLE.labelLift) * s;
      tmp.project(sn);
      const off = !shown(mk.group) || tmp.z > 1 || Math.abs(tmp.x) > 1.1 || Math.abs(tmp.y) > 1.1;
      mk.el.style.display = off ? "none" : "block";
      if (!off) {
        mk.el.style.left = ((tmp.x + 1) / 2) * innerWidth + "px";
        mk.el.style.top = ((1 - tmp.y) / 2) * innerHeight + "px";
      }
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  // ---- Watchtowers ---------------------------------------------------------
  const towers = new Map(); // id -> marker
  let selectedId = null;
  const ID_RE = /^[A-Za-z0-9_-]{1,16}$/;

  function clearTowers() {
    for (const mk of towers.values()) removeMarker(mk);
    towers.clear();
    selectedId = null;
  }
  function setTowers(list) {
    if (!Array.isArray(list)) throw new Error("payload.towers must be an array");
    clearTowers();
    const rejected = [];
    let pending = 0;
    for (const t of list.slice(0, 50)) {
      const id = t && typeof t.id === "string" && ID_RE.test(t.id) ? t.id : null;
      if (!id) { rejected.push({ id: String(t?.id ?? "").slice(0, 16), reason: "invalid id" }); continue; }
      if (towers.has(id)) { rejected.push({ id, reason: "duplicate id" }); continue; }
      if (t.source === "PENDING") { pending++; continue; } // no position yet: nothing to draw
      const st = Object.hasOwn(STYLE.tower, t.source) ? STYLE.tower[t.source] : null;
      if (!st) { rejected.push({ id, reason: "source must be REAL, SYNTHETIC or PENDING" }); continue; }
      if (!finite(t.lat, t.lon)) { rejected.push({ id, reason: "lat and lon must be numbers" }); continue; }
      const [E, N] = a_(t.lat, t.lon);
      const e = E - eh, n = N - nh;
      if (!inExtent(e, n)) { rejected.push({ id, reason: "outside the digital twin extent" }); continue; }
      const mk = makeMarker({
        e, n, color: STYLE.towerState.offline, mastColor: st.mast, opacity: st.opacity,
        title: id, sub: typeof t.name === "string" ? t.name.slice(0, 60) : "",
        badge: t.source === "REAL" ? "" : t.source, cls: t.source.toLowerCase(), withMast: true, pin: true,
      });
      mk.group.traverse((o) => { o.userData.towerId = id; });
      towerLayer.add(mk.group);
      towers.set(id, mk);
      applyStatus(id);
    }
    return { drawn: towers.size, pending, rejected };
  }
  // Status per tower, kept so it survives watchtowers.set reloads.
  const STATES = Object.keys(STYLE.towerState);
  const statusById = new Map(); // id -> { state, cameras }
  function applyStatus(id) {
    const mk = towers.get(id);
    if (!mk) return;
    const st = statusById.get(id) || { state: "offline", cameras: null };
    for (const s of STATES) mk.el.classList.toggle("st-" + s, s === st.state);
    mk.group.children[0].material.color.setHex(STYLE.towerState[st.state]);
    if (mk.count) mk.count.textContent = st.cameras == null ? "" : st.cameras > 0 ? String(st.cameras) : "!";
  }
  function setStatus(map) {
    if (!map || typeof map !== "object" || Array.isArray(map)) throw new Error("payload.towers must be an object of id -> status");
    const rejected = [];
    let applied = 0;
    for (const [id, v] of Object.entries(map).slice(0, 50)) {
      if (!ID_RE.test(id)) { rejected.push({ id: id.slice(0, 16), reason: "invalid id" }); continue; }
      const state = v && typeof v.state === "string" ? v.state : "";
      if (!STATES.includes(state)) { rejected.push({ id, reason: "state must be " + STATES.join(", ") }); continue; }
      const cams = Number.isInteger(v.cameras) && v.cameras >= 0 && v.cameras < 100 ? v.cameras : null;
      statusById.set(id, { state, cameras: cams });
      applyStatus(id);
      applied++;
    }
    return { applied, rejected };
  }

  function selectTower(id) {
    const prev = selectedId && towers.get(selectedId);
    if (prev) { prev.el.classList.remove("sel"); prev.group.children[0].scale.setScalar(1); }
    selectedId = towers.has(id) ? id : null;
    const cur = selectedId && towers.get(selectedId);
    if (cur) { cur.el.classList.add("sel"); cur.group.children[0].scale.setScalar(1.5); }
  }

  // ---- Pick tool (a flat white ring, clearly not a tower) ----------------------
  let pickMarker = null;
  function clearPin() { if (pickMarker) { removeMarker(pickMarker); pickMarker = null; } }
  function setPin(e, n) {
    clearPin();
    pickMarker = makeMarker({
      e, n, color: STYLE.pick, mastColor: STYLE.pick, opacity: 0.75,
      title: "PICKED POINT", sub: "", badge: "MAP TOOL", cls: "pick", withMast: false,
    });
    layer.add(pickMarker.group);
  }

  // ---- Simulation layer (ground truth, bearing lines, estimate, 95% ellipse) ----
  const simLayer = new mn();
  simLayer.name = "aisunog-simulation";
  layer.add(simLayer);
  let simMarkers = [];
  function clearSimulation() {
    for (const mk of simMarkers) removeMarker(mk);
    simMarkers = [];
    for (const c of [...simLayer.children]) { simLayer.remove(c); disposeTree(c); }
  }
  const toLocal = (ll) => {
    if (!ll || !finite(ll.lat, ll.lon)) return null;
    const [E, N] = a_(ll.lat, ll.lon);
    return [E - eh, N - nh];
  };
  // Dashed line draped over the terrain: dashed = simulated, never a real camera.
  function dashedRay(a, b, color) {
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const g = new mn();
    if (!(len > 1) || len > 50000) return g;
    const ux = (b[0] - a[0]) / len, uy = (b[1] - a[1]) / len;
    const mat = new rs({ color, transparent: true, opacity: 0.95, depthTest: false });
    const { dashOn, dashOff, rayLift } = STYLE.sim;
    for (let s0 = 0; s0 < len; s0 += dashOn + dashOff) {
      const s1 = Math.min(len, s0 + dashOn), pts = [];
      for (let t = s0; ; t = Math.min(s1, t + 30)) {
        const x = a[0] + ux * t, y = a[1] + uy * t;
        pts.push(new P(...rn(x, y, Fi(x, y) + rayLift)));
        if (t >= s1) break;
      }
      const line = new gr(new _e().setFromPoints(pts), mat);
      line.renderOrder = 8;
      g.add(line);
    }
    return g;
  }
  // 95% error ellipse, true size on the ground, in the twin's grid frame.
  function ellipseMesh(c, el) {
    const a = el.semi_major_m, b = el.semi_minor_m, phi = (el.orientation_deg * Math.PI) / 180;
    const u = [Math.sin(phi), Math.cos(phi)], v = [Math.cos(phi), -Math.sin(phi)];
    const shape = new os(), outline = [];
    const z = Fi(c[0], c[1]) + 2;
    for (let k = 0; k <= 72; k++) {
      const th = (k / 72) * Math.PI * 2;
      const x = a * Math.cos(th) * u[0] + b * Math.sin(th) * v[0];
      const y = a * Math.cos(th) * u[1] + b * Math.sin(th) * v[1];
      k ? shape.lineTo(x, y) : shape.moveTo(x, y);
      outline.push(new P(...rn(c[0] + x, c[1] + y, z)));
    }
    const geo = new br(shape, 1);
    geo.rotateX(-Math.PI / 2);
    const fill = new pe(geo, new xn({ color: STYLE.sim.estimate, transparent: true, opacity: STYLE.sim.ellipseOpacity, depthTest: false, depthWrite: false, side: Ge }));
    fill.position.set(...rn(c[0], c[1], z));
    fill.renderOrder = 9;
    const edge = new gr(new _e().setFromPoints(outline), new rs({ color: STYLE.sim.estimate, depthTest: false }));
    edge.renderOrder = 9;
    const g = new mn();
    g.add(fill, edge);
    return g;
  }
  function showSimulation(p) {
    const truth = toLocal(p.truth);
    if (!truth || !inExtent(...truth)) throw new Error("truth must be a lat/lon inside the twin");
    const est = p.estimate ? toLocal(p.estimate) : null;
    if (p.estimate && (!est || !inExtent(...est))) throw new Error("estimate must be a lat/lon inside the twin");
    const el = p.ellipse;
    if (el && !(finite(el.semi_major_m, el.semi_minor_m, el.orientation_deg) && el.semi_minor_m >= 0 && el.semi_major_m <= 50000)) {
      throw new Error("invalid ellipse");
    }
    const rays = Array.isArray(p.rays) ? p.rays.slice(0, 20) : [];
    clearSimulation();
    let drawn = 0;
    for (const r of rays) {
      const a = toLocal(r?.from), b = toLocal(r?.to);
      if (!a || !b) continue;
      simLayer.add(dashedRay(a, b, STYLE.sim.ray));
      drawn++;
    }
    if (est && el && el.semi_major_m >= 1) simLayer.add(ellipseMesh(est, el));
    const fire = makeMarker({
      e: truth[0], n: truth[1], color: STYLE.sim.truth, mastColor: STYLE.sim.truth, opacity: 1,
      title: "SIM FIRE", sub: "Ground truth", badge: "SIMULATED", cls: "simfire", withMast: true,
    });
    simLayer.add(fire.group);
    simMarkers.push(fire);
    if (est) {
      const errText = finite(p.estimate.error_m) ? `${Math.round(p.estimate.error_m)} m from truth` : "";
      const mk = makeMarker({
        e: est[0], n: est[1], color: STYLE.sim.estimate, mastColor: STYLE.sim.estimate, opacity: 1,
        title: "ESTIMATE", sub: errText, badge: "SIMULATED", cls: "estimate", withMast: false,
      });
      simLayer.add(mk.group);
      simMarkers.push(mk);
    }
    return { rays: drawn, estimate: !!est };
  }

  // ---- Pointer handling ------------------------------------------------------
  let pickId = null;
  let down = null;
  const canvas = an.domElement;
  const disarm = () => { pickId = null; canvas.style.cursor = ""; };

  canvas.addEventListener("pointerdown", (ev) => { down = [ev.clientX, ev.clientY]; });
  canvas.addEventListener("pointerup", (ev) => {
    // Ignore drags (camera moves), same 4 px rule the twin uses.
    if (!down || Math.hypot(ev.clientX - down[0], ev.clientY - down[1]) > 4) return;
    const r = canvas.getBoundingClientRect();
    zr.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
    Br.setFromCamera(zr, sn);

    if (pickId === null) {
      // Not picking: a click on a tower selects it.
      if (!shown(towerLayer)) return;
      const hitT = Br.intersectObjects(towerLayer.children, true)[0];
      const tid = hitT?.object.userData.towerId;
      if (tid) { selectTower(tid); send("watchtower.selected", { id: tid, source: "map" }); }
      return;
    }

    const targets = [Fr, ms].filter((o) => o && o.visible);
    const hit = Br.intersectObjects(targets, false)[0];
    const id = pickId;
    if (!hit) return send("pick.miss", { reason: "Nothing under the cursor. Click on terrain or a building." }, id);
    const e = hit.point.x, n = -hit.point.z, elev = hit.point.y;
    if (!inExtent(e, n)) return send("pick.miss", { reason: "Outside the digital twin extent." }, id);
    const [lat, lon] = utmToLatLon(e + eh, n + nh);
    setPin(e, n);
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
    "simulation.show": (p, id) => {
      const r = showSimulation(p);
      send("simulation.shown", r, id);
      const t = toLocal(p.truth);
      if (p.fly !== false) ih(t[0], t[1], STYLE.sim.flyDistance);
    },
    "simulation.clear": (p, id) => { clearSimulation(); send("simulation.cleared", {}, id); },
    "watchtowers.set": (p, id) => send("watchtowers.applied", setTowers(p.towers), id),
    "watchtowers.status": (p, id) => send("watchtowers.status.applied", setStatus(p.towers), id),
    "layers.set": (p, id) => {
      const MAP = { terrain: "lT", buildings: "lB", roads: "lR", sidewalks: "lS", boundaries: "lG" };
      const done = {};
      for (const [k, elId] of Object.entries(MAP)) {
        if (typeof p[k] !== "boolean") continue;
        const box = document.getElementById(elId);
        if (!box || box.checked === p[k]) { done[k] = p[k]; continue; }
        box.checked = p[k];
        box.dispatchEvent(new Event("change")); // the twin's own toggle handler
        done[k] = p[k];
      }
      send("layers.applied", done, id);
    },
    "view.overview": (p, id) => { document.getElementById("overview")?.click(); send("view.flying", { overview: true }, id); },
    "watchtowers.visible": (p, id) => {
      towerLayer.visible = p.visible !== false;
      send("watchtowers.visibility", { visible: towerLayer.visible }, id);
    },
    "watchtower.select": (p, id) => {
      const tid = typeof p.id === "string" ? p.id : "";
      if (!towers.has(tid)) return fail(`Watchtower not on the map: ${tid.slice(0, 16)}`, id);
      selectTower(tid);
      const mk = towers.get(tid);
      if (p.fly !== false) ih(mk.e, mk.n, STYLE.towerFlyDistance);
      send("watchtower.selected", { id: tid, source: "dashboard" }, id);
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
