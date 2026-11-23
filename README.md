# AI-SUNOG Monitoring Prototype

## Step 1: Digital twin in React

The existing Muntinlupa digital twin runs inside a React + Tailwind dashboard. A small add-on script (the "bridge") lets React talk to the twin.

### Folders

```
dt-prototype/
  digital-twin/
    original/Muntinlupa_Digital_Twin_offline.html   your twin, never edited
    bridge/twin-bridge.js                            the add-on (message API)
    build_twin.py                                    makes the dashboard copy
  frontend/                                          React + Vite + Tailwind v4
    public/digital-twin/...offline.html              GENERATED copy (original + bridge)
    src/App.jsx                                      page layout
    src/components/DigitalTwin.jsx                   the iframe
    public/config/watchtowers.json                   watchtower positions (you edit this)
    src/components/WatchtowerPanel.jsx               tower list, source badges, focus
    src/components/MapTools.jsx                      pick a point + fly-to (collapsed)
    src/services/watchtowers.js                      loads and validates the tower file
    src/components/MessageLog.jsx                    bridge message log
    src/services/useTwinBridge.js                    React side of the bridge
```

### Run it (Windows, VS Code terminal)

```powershell
cd dt-prototype\frontend
npm install          # first time only: downloads React, Vite, Tailwind
npm run dev          # starts the dev server, open the printed http://localhost:5173
```

The generated twin is already included. If you change `twin-bridge.js` or replace the original twin, rebuild it:

```powershell
npm run build:twin   # runs python ../digital-twin/build_twin.py
```

`build_twin.py` checks that the twin still has every internal name the bridge needs. If you regenerate the twin (for example with FABDEM terrain), the names may change and the script stops with a clear error instead of producing a broken map.

### Test checklist

1. The header changes to **TWIN CONNECTED**.
2. Everything from the original twin still works: layers, colour modes, fly to barangay, building inspector, `cameras.csv` upload.
3. Open **Map tools**, click **Pick a point**, then click the terrain or a building. A white ring labelled MAP TOOL appears and the panel shows lat/lon, UTM and elevation. The UTM values match the twin's own coordinate readout (top right of the map). Esc cancels picking.
4. Type a coordinate in **Fly** and click it. The camera flies there.
5. Type a point outside Muntinlupa (for example 0, 0) and click **Fly**. You should see a red error and the camera should not move.

### How to undo

Point `VITE_TWIN_URL` at the untouched original (copy it into `public/` under another name), or simply delete the bridge block between `BEGIN AI-SUNOG BRIDGE` and `END AI-SUNOG BRIDGE` in the generated file.

### Message API (v1)

All messages use `{ ns: "ai-sunog-twin", v: 1, type, id, payload }`. Both sides only accept messages from the same origin and from the expected window.

| Direction | Type | Payload |
|---|---|---|
| React -> twin | `ping` | none; twin answers `twin.ready` |
| React -> twin | `pick.start`, `pick.cancel` | none |
| React -> twin | `marker.clear` | none |
| React -> twin | `view.flyTo` | `lat`, `lon`, optional `distance_m` (200 to 20000) |
| twin -> React | `twin.ready` | `crs`, `origin_utm`, `extent_local`, `bridge_version` |
| twin -> React | `pick.result` | `lat`, `lon`, `utm_e`, `utm_n`, `local_e`, `local_n`, `elev_m`, `ground_elev_m`, `hit` |
| twin -> React | `pick.armed`, `pick.miss`, `pick.cancelled`, `view.flying`, `marker.cleared`, `error` | status replies |

### Verified

- The bridge's UTM-to-lat/lon conversion matches pyproj within 0.04 mm (200 random points across the twin).
- Headless browser test: twin connects, pick and fly-to work, unknown types, wrong versions, out-of-area and non-numeric fly-to are rejected, a page on another origin gets no replies.

## Step 1b: Watchtower markers

Tower positions come from **`frontend/public/config/watchtowers.json`**. The app reads it at runtime, so after editing the file you only click **Reload** in the Watchtowers panel (no rebuild).

```json
{ "id": "WT-01", "name": "Tunasan", "site": "School name", "lat": 14.xxxxxx, "lon": 121.xxxxxx, "source": "REAL", "notes": "How it was measured" }
```

| `source` | Meaning | On the map |
|---|---|---|
| `REAL` | Surveyed WGS84 coordinates | Cyan tower + ring, `REAL` badge |
| `SYNTHETIC` | Temporary test value, must be replaced | Pink tower + ring, `SYNTHETIC` badge |
| `PENDING` | No coordinates yet (`lat` and `lon` must be `null`) | Not drawn; panel says "Position pending" |

The file ships with all three towers as `PENDING`. Nothing is drawn until real (or approved synthetic) coordinates are entered. Invalid entries (bad id, duplicate id, missing numbers, outside the twin area) are skipped and listed in red in the panel.

Click a tower in the panel to fly to it, or click a tower on the map to select it. The **On map** checkbox hides or shows the towers.

### Fixed values in the code (display only)

These are visual settings in `twin-bridge.js` (`STYLE`). None of them affect coordinates or calculations:

| Value | Where | Purpose |
|---|---|---|
| Marker colours (cyan REAL, pink SYNTHETIC, white map tool) | `STYLE.tower`, `STYLE.pick` | Tell sources apart |
| Marker size (mast 45 m, head 12 m, ring 14 to 20 m) and zoom scaling (1x to 10x) | `STYLE` | Keep markers visible at any zoom |
| Fly-to distance for a selected tower (1800 m) | `STYLE.towerFlyDistance` | Camera framing |
| Config path `config/watchtowers.json` | `src/services/watchtowers.js` | Override with `VITE_WATCHTOWERS_URL` |

## Next: Step 2 (simulated fire + triangulation)

Tower positions will live in `central_server/config/watchtowers.yaml`. Each tower gets a real-coordinates slot (empty until you provide surveyed values) and a clearly labelled SYNTHETIC test position taken from the barangay label points in the twin. Real values always win when present.
