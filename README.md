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
    (tower positions: server/config/watchtowers.json)
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

Tower positions come from **`server/config/watchtowers.json`** (moved there in Step 2; the server loads it into PostgreSQL). After editing the file, click **Reload** in the Watchtowers panel (no restart).

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
| Tower list endpoint `/api/watchtowers` | `src/services/watchtowers.js` | Served by the Step 2 server |

## Step 2: Fire simulation and triangulation (PostgreSQL)

```
React dashboard  --/api-->  FastAPI server  -->  PostgreSQL (aisunog_dt)
  Simulation panel           server/app/         watchtowers, simulations,
  twin draws the result      config/*.json       observations, triangulations
```

### One-time setup

**1. Create the database** (pgAdmin Query Tool, or `psql -U postgres` in a terminal):

```sql
CREATE USER aisunog_dt WITH PASSWORD 'choose-a-password';
CREATE DATABASE aisunog_dt OWNER aisunog_dt;
```

This makes a separate login and database just for the prototype, so it cannot touch your other databases. On Windows, `psql` is in `C:\Program Files\PostgreSQL\<version>\bin\`.

**2. Set up Python** (from the `server` folder):

```powershell
cd server
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
copy .env.example .env
```

- `python -m venv .venv` creates an isolated Python environment for this project.
- `.\.venv\Scripts\Activate.ps1` switches the terminal to it (you will see `(.venv)`). If Windows says scripts are disabled, first run `Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass`.
- `pip install -r requirements.txt` installs FastAPI, SQLAlchemy, the PostgreSQL driver, pyproj and numpy.
- `copy .env.example .env` creates your private settings file. Open `server/.env` and put your password in `DATABASE_URL`. `.env` is in `.gitignore`, so it is never pushed.

### Run (two terminals)

```powershell
# Terminal 1: API server (tables are created automatically on first start)
cd server
.\.venv\Scripts\Activate.ps1
uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload

# Terminal 2: dashboard
cd frontend
npm run dev
```

Check the server alone at http://127.0.0.1:8000/api/health (should say `"database": "postgresql"`). Interactive API docs: http://127.0.0.1:8000/docs.

### Using the simulation

1. **Pick on map** (or type lat/lon) to place the simulated fire. This is the **ground truth**.
2. Set the bearing error with the slider. Optionally enter a seed to repeat a run exactly.
3. **Run simulation.** Each tower within range gets the true bearing plus random error. The server triangulates and returns:
   - the estimate (yellow ring) next to the truth (orange-red SIM FIRE), with the error in metres
   - the 95% error ellipse (yellow area): the fire should fall inside it about 95% of the time
   - dashed orange bearing lines (dashed = simulated, never a real camera)
   - REJECTED with a reason when the geometry is not good enough (fewer than 2 bearings, lines nearly parallel, behind a tower, out of range)

Everything is saved in PostgreSQL. History lists past runs; Reset deletes them all.

### Tests

```powershell
cd server
pytest                       # math tests (no database needed)
```

API tests need an **empty** test database (they delete simulations): create `aisunog_dt_test` the same way, then
`set TEST_DATABASE_URL=postgresql+psycopg://aisunog_dt:PASSWORD@127.0.0.1:5432/aisunog_dt_test` and run `pytest` again.

### Settings (no hidden values)

| File | Contents |
|---|---|
| `server/config/watchtowers.json` | Tower positions (source of truth, synced into the database on start and on Reload) |
| `server/config/simulation.json` | TEMPORARY approved values: noise default 1 deg (max 5), min ray angle 5 deg, max range 8000 m, plus a display-only line length factor. Re-read on every run, no restart needed. |
| `server/.env` | Database URL (private) |

Fixed in code: EPSG:32651 as the default metre grid (same as the twin; overridable with `CRS_EPSG`), the 95% chi-square constant 5.991 (statistics), and display-only styling in `twin-bridge.js` (`STYLE.sim`).

## Step 3A: Cameras and AI detection

```
camera_node (LAB-A)  --+                           +--> dashboard: live feeds, status,
camera_node (LAB-B)  --+--HTTP + node key--> server|    detection list with snapshots
camera_node (LAB-C)  --+                           +--> PostgreSQL: cameras, detections
 (3 separate programs: webcam -> YOLO -> send)          (snapshots saved in server/storage/)
```

Each camera runs as its **own program**. If one webcam is unplugged or crashes, the others keep running. The same code will run on a Jetson later; only the config file changes.

### One-time setup

**1. Shared node key.** Make a random key:

```powershell
python -c "import secrets; print(secrets.token_hex(16))"
```

Put it in `server/.env` as `NODE_API_KEY=...` and restart the server. Then create `camera_node/.env` with the **same** line. The server refuses detections from anything without this key.

**2. Python environment for the camera nodes** (from the `camera_node` folder):

```powershell
cd camera_node
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install torch torchvision --index-url https://download.pytorch.org/whl/cu128
pip install -r requirements.txt
python -c "import torch; print(torch.cuda.is_available(), torch.cuda.get_device_name(0))"
```

- The `torch` line installs PyTorch **with GPU (CUDA 12.8) support**. RTX 50-series GPUs need CUDA 12.8 or newer. A plain `pip install torch` on Windows gives a CPU-only version.
- The last line must print `True` and your GPU name. If it prints `False`, YOLO will run on the CPU (slow).

**3. Model.** Copy your `best.pt` into `camera_node/models/`. Model files are never committed (`.gitignore`).

**4. Find which webcam is which.** Plug in all three webcams, then:

```powershell
python tools/list_cameras.py
```

It saves one snapshot per webcam in `camera_node/captures/`. Open them to see which index is which physical webcam (index 0 is usually the laptop's own camera). Put the right index in `source.device_index` of `config/LAB-A.json`, `LAB-B.json` and `LAB-C.json`. The nodes refuse to start until this is set, on purpose.

### Run

Start the server and dashboard as before, then the three cameras:

```powershell
cd camera_node
.\start_lab_nodes.ps1
```

This opens three windows, one per camera. Or start one camera by hand:
`python -m node --config config/LAB-A.json`.

On the dashboard: each camera shows **ONLINE**, **OFFLINE** (no heartbeat for 6 s), **ERROR** (camera can't be opened) or **DETECTING** (fire/smoke in the last 5 s). Detections appear in **AI detections** with a snapshot, and are saved in PostgreSQL.

**Testing tip:** your model labels small or synthetic flames as *smoke* (it was trained on wildfire and structure-fire images). Show real fire footage on a phone or monitor in front of the webcam.

### Settings (pending your approval)

| File | Values |
|---|---|
| `camera_node/config/detection.json` | confidence threshold 0.5, YOLO 5 runs/s per camera, preview 2 images/s at 640 px, one event per 2 s while fire stays visible, heartbeat every 2 s |
| `camera_node/config/LAB-*.json` | webcam index (you set it), 640x480 MJPG, DirectShow |
| `server/config/monitoring.json` | OFFLINE after 6 s without heartbeat, DETECTING window 5 s, snapshot max 2 MB |

### Tests

`server/tests/test_cameras.py` (needs `TEST_DATABASE_URL`): node key required, ONLINE/ERROR status, detection saved once even if resent, simulated events refused on the camera endpoint, bad images refused.

## Next: Step 3B (lab triangulation)

Measure the webcam positions and directions in the room, convert each detection's position in the image into a bearing, and triangulate the fire screen's position.
