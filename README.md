# AI-SUNOG Monitoring Prototype

## Step 1: Digital twin in React (done)

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
    src/components/TwinControls.jsx                  test panel: pick + fly-to
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
3. Click **Pick on map**, then click the terrain or a building. A magenta pin appears and the panel shows lat/lon, UTM and elevation. The UTM values match the twin's own coordinate readout (top right of the map). Esc cancels picking.
4. Click **Use for fly-to**, then **Fly**. The camera flies to that point.
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

## Next: Step 2 (simulated fire + triangulation)

Tower positions will live in `central_server/config/watchtowers.yaml`. Each tower gets a real-coordinates slot (empty until you provide surveyed values) and a clearly labelled SYNTHETIC test position taken from the barangay label points in the twin. Real values always win when present.
