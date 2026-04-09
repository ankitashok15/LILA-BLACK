LILA BLACK — Player Behavior Visualizer (Static SPA)
====================================================

What this is
------------
This project visualizes player behavior over time on a minimap:
- Movement paths (Canvas)
- Discrete events (Kill/Loot/etc.)
- Heatmap overlay (simpleheat)
- Playback controls (scrub + play/pause)

Architecture summary
--------------------
- Frontend: React 18 + TypeScript + Vite + Tailwind + Zustand
- Rendering: multi-layer HTML5 Canvas (minimap, paths, events, heatmap, hover/selection)
- Data: Parquet is converted to static JSON at build time (browser never reads Parquet)
- Hosting: static deploy (Vercel-ready)

Quick start (demo data already included)
---------------------------------------
1) Install Node.js (includes npm)
   - Download from: https://nodejs.org/

2) From this folder, install dependencies and run dev server:
   - Open PowerShell in:
     C:\Users\Hp\OneDrive\Desktop\LILA BLACK

   Commands:
     npm install
     npm run dev

3) Open the local URL printed by Vite (usually http://localhost:5173).

The app will fetch demo JSON from:
  public\data\matches_index.json
  public\data\AmbroseValley_Feb10.json
  public\data\GrandRift_Feb10.json
  public\data\AmbroseValley_Feb14.json   (marked partial)

Generate real data from your Parquet files (ETL)
------------------------------------------------
You only need this step if you want to replace demo data with your real dataset.

1) Install Python 3.x
   - From: https://www.python.org/downloads/
   - Make sure “Add Python to PATH” is enabled during install.

2) Put your input files here:
   - Parquet telemetry:
       data\raw\  (can contain subfolders; script scans recursively)
   - Source minimap images (original sizes):
       data\minimaps_source\
       Expected names: AmbroseValley.(png/jpg/webp), GrandRift.(...), Lockdown.(...)

3) Install Python dependencies:
     pip install -r requirements.txt

4) Run the ETL:
     python scripts\process_data.py --raw-dir data\raw --out-dir public\data --minimap-src-dir data\minimaps_source --partial-dates Feb14

Notes:
- If your Parquet files do NOT contain a date column, add:
    --default-date 2026-02-10
- Output files are written into public\data\ and will be served by Vite/Vercel automatically.

Validate coordinate mapping (offline sanity check)
--------------------------------------------------
This creates an overlay PNG to confirm world→pixel mapping is correct.

Install deps first:
  pip install -r requirements.txt

Run:
  python scripts\validate_coords.py public\data\AmbroseValley_Feb10.json public\data\minimaps\AmbroseValley.png match-demo-av-01 user_alice

Output:
  validate_coords_out.png

Folder layout
-------------
Frontend:
  src\
    App.tsx
    main.tsx
    components\
      Sidebar.tsx
      MapCanvas.tsx
    store\
      useAppStore.ts
    hooks\
      useDataLoader.ts
    lib\
      mapConfig.ts
      binarySearch.ts
      playerColor.ts

Static data served by the app:
  public\data\
    matches_index.json
    {MapName}_{DateKey}.json
    minimaps\
      {MapName}.png   (1024×1024)

ETL + tooling:
  scripts\
    process_data.py
    inspect_parquet.py
    validate_coords.py
  data\
    raw\
    minimaps_source\

Vercel full-stack deployment (frontend + backend)
-------------------------------------------------
This project now includes:
- Frontend (Vite static app)
- Backend (Vercel serverless functions under `api/`)

Backend endpoints:
- `GET /api/health`  -> service heartbeat
- `GET /api/chunks`  -> returns `matches_index.json`
- `GET /api/chunk?map=AmbroseValley&dateKey=Feb10` -> returns one chunk JSON

Frontend data loader behavior:
- Tries backend first (`/api/*`)
- Falls back to static files (`/data/*`) for local dev compatibility

Deploy steps:
1) Push this project to GitHub.
2) In Vercel, import the repo.
3) Framework can stay as “Other” (or auto-detected Vite), build command `npm run build`, output `dist`.
4) Deploy.
5) Verify:
   - `/api/health` returns `{ ok: true, ... }`
   - App loads and chunk switching works.

Event type semantics (important)
-------------------------------
Events are interpreted as belonging to the human player file owner (the “subject”).
- Kill     : human killed human
- BotKill  : human killed bot
- Killed   : human died to human
- BotKilled: human died to bot

Common troubleshooting
----------------------
- “npm is not recognized”
  - Install Node.js (includes npm) from https://nodejs.org/
  - Close and reopen PowerShell (PATH refresh)
  - Verify:
      node --version
      npm --version

- “Python was not found”
  - Install Python 3.x from https://www.python.org/downloads/
  - During install enable “Add Python to PATH”
  - Close and reopen PowerShell
  - Verify:
      python --version
    If `python` still doesn’t work on Windows, try:
      py --version
      py -3 --version

- ETL fails: “No .parquet under data\\raw”
  - Put your Parquet files inside:
      data\\raw\\
    (subfolders are OK; the script scans recursively)
  - If your files have no `.parquet` extension (example: `*.nakama-0`), that is valid for this dataset.
    The ETL now reads parquet-like files with `.nakama-0` and extensionless names too.

- ETL fails when source folder is `player_data\\February_*`
  - Keep your dataset folder structure, but point `--raw-dir` to the parent:
      py -3 scripts\\process_data.py --raw-dir player_data --out-dir public\\data --minimap-src-dir data\\minimaps_source --partial-dates Feb14
  - Date keys can be inferred from folder names like `February_10` to `February_14`.

- ETL fails: missing columns (match_id / user_id / x / z / ts)
  - Your Parquet column names may differ from the expected aliases.
  - Inspect a sample file schema:
      python scripts\\inspect_parquet.py path\\to\\one.parquet
  - Then either rename columns upstream or extend alias lists in:
      scripts\\process_data.py
  - Dataset-specific note from `READMEE.md`:
    - map column may be `map_id` (supported)
    - event column may be `event` stored as bytes (decoded during ETL)
    - timestamp `ts` may be datetime-like but represents elapsed match time

- Blank screen / 404 fetching /data/*
  - You must run the dev server:
      npm run dev
  - Ensure these exist on disk:
      public\\data\\matches_index.json
      public\\data\\{Map}_{DateKey}.json
      public\\data\\minimaps\\{Map}.png
  - Check that the JSON filenames match the index entries exactly.

- Minimap not showing (dark square)
  - Verify the file exists:
      public\\data\\minimaps\\AmbroseValley.png (and others)
  - If you replaced minimaps, confirm they are 1024×1024 (Phase 5 requirement).

- Heatmap looks heavy / slow on huge data
  - Keep paths downsampled (every 3rd point) and use full density only for heatmaps.
  - If still slow, reduce heat radius/blur or rebuild heatmap only when filters change.
