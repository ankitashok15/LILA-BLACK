# Architecture — LILA BLACK Player Behavior Visualizer

This document is the **single source of truth** for phased delivery: every phase is listed, numbered, and expanded with scope, artifacts, tasks, and acceptance criteria. Reference material (stack rationale, data flow, schema, assumptions, tradeoffs) is included in full so nothing lives only in an older draft.

---

## 1. Document map

| Section | Contents |
|---------|----------|
| [§2 Full tech stack](#2-full-tech-stack--rationale) | Layer-by-layer choices and why |
| [§3 Phase dependency summary](#3-phase-dependency-summary) | What blocks what |
| [§4–§16 Phases 1–13 (detailed)](#4-phase-1--environment--data-contract) | All implementation phases, in order |
| [§17 Data flow (diagram)](#17-data-flow-build--runtime) | Build vs runtime pipeline |
| [§18 JSON schema](#18-json-schema-per-mapdate-chunk) | Chunk format |
| [§19 Coordinate mapping](#19-coordinate-mapping) | World → pixel, map tables |
| [§20 Assumptions & ambiguities](#20-assumptions--ambiguities) | Decisions table |
| [§21 Major tradeoffs](#21-major-tradeoffs) | Alternatives considered |
| [§22 Event type semantics](#22-event-type-semantics) | Kill / BotKill / Killed / BotKilled |
| [§23 Validation](#23-validation) | Coordinate proof |
| [§24 Appendix — public/data layout](#24-appendix--publicdata-layout) | Directory contract |
| [§25 Master phase checklist](#25-master-phase-checklist-all-phases) | All phases, trackable |

---

## 2. Full tech stack & rationale

| Layer | Choice | Rationale |
|-------|--------|-----------|
| **Framework** | React 18 + TypeScript (Vite) | Complex interactive state (filters, playback, heatmap modes) needs a component architecture. TypeScript catches coordinate math bugs at compile time. Vite gives fast HMR during development. |
| **Rendering** | HTML5 Canvas (multi-layer) | Plotting ~89K events plus path lines and heatmap overlays. SVG would choke at this volume. Canvas gives pixel-level control and compositing via layered canvases. |
| **State** | Zustand | Lightweight store without Redux boilerplate. Single source of truth for filters, playback state, and selected match. |
| **Heatmaps** | `simpleheat` | Tiny (~2KB) Canvas-based heatmap library. Renders directly onto a canvas layer the app controls. No heavyweight dependencies. |
| **Zoom/Pan** | Custom Canvas transforms | Keeps minimap, paths, markers, and heatmap in one coordinate system. Libraries like `react-zoom-pan-pinch` fight with Canvas. |
| **Styling** | Tailwind CSS | Utility-first, fast iteration, dark theme via classes. Fewer bespoke CSS files to maintain. |
| **Data pipeline** | Python (`pyarrow` + `pandas`) | Parquet → JSON conversion at **build time**. Python is the natural tool for Parquet; the browser never parses raw Parquet. |
| **Hosting** | Vercel | Free tier, auto-deploy from GitHub, shareable URLs, minimal config for Vite static output. |

**Runtime topology:** fully static SPA — no Express/Flask API. Dataset is fixed (~5 days of matches); no auth or writes required.

---

## 3. Phase dependency summary

```
Phase 1 ─┬─► Phase 2 ─► Phase 3 ─► Phase 4 ─► Phase 5 ─► Phase 6
         │                                                      │
         └──────────────────────────────────────────────────────┘
                                    (minimaps can parallelize after map list known)

Phase 6 complete (data on disk) ─► Phase 7 ─► Phase 8 ─► Phase 9 ─► Phase 10
                                                              │
                    Phase 11 ◄────────────────────────────────┤
                         │                                    │
                         ▼                                    │
                    Phase 12 ◄────────────────────────────────┘
                         │
                         ▼
                    Phase 13
```

| Phase | Name | Hard dependency |
|-------|------|-----------------|
| 1 | Environment & data contract | Raw Parquet + README formulas |
| 2 | Parquet ingest & decode | Phase 1 |
| 3 | Timestamps, grouping, bot/human | Phase 2 |
| 4 | World → pixel & JSON emission | Phase 3 |
| 5 | Minimap resize & `public/data` layout | Phase 4 (or parallel once map names fixed) |
| 6 | Offline coordinate validation | Phases 4–5 |
| 7 | App scaffold (Vite/React/TS/Tailwind/Zustand) | Phase 5 assets exist |
| 8 | Index + chunk loading + types | Phase 7 |
| 9 | Multi-layer canvas & sizing | Phase 8 |
| 10 | Zoom, pan, unified transform | Phase 9 |
| 11 | Paths, downsampling, playback | Phase 10 |
| 12 | Events, heatmaps, filters | Phase 11 |
| 13 | Interaction, edge-case UI, deploy | Phase 12 |

---

## 4. Phase 1 — Environment & data contract

### 4.1 Objective

Lock Python tooling, repository paths, and the **contract** between raw data and ETL (what each Parquet row means, which columns exist) before writing conversion logic.

### 4.2 In scope

- Python 3.x environment with `pyarrow`, `pandas` (and any README-specified readers).
- Documented paths: raw Parquet root, `scripts/`, `public/data/`.
- Inventory: **~1,243** `.parquet` files, **~8 MB** across **5 days** (order-of-magnitude sanity check).

### 4.3 Out of scope

- UI code; coordinate plotting in the browser.

### 4.4 Inputs

- Raw `.parquet` files as provided by the project.
- README: UV / world mapping formula, field meanings, `ts` semantics.

### 4.5 Outputs (artifacts)

- `requirements.txt` or `pyproject.toml` pinning ETL dependencies.
- Short internal note or comments in `scripts/process_data.py` documenting column → JSON field mapping.

### 4.6 Detailed tasks

1. Create/verify virtual environment; install `pyarrow`, `pandas`.
2. List one sample file; print schema (dtypes, nested columns for events).
3. Confirm where `match_id`, `user_id`, world `x,y,z`, event payloads, and bot flags (or inference rules) live.
4. Define exit codes / logging convention for ETL (fail loud on corrupt file).

### 4.7 Acceptance criteria

- One command runs a “dry read” of N sample files without crash.
- Team agrees on which README statements are authoritative for `ts` and coordinates.

---

## 5. Phase 2 — Parquet ingest & decode

### 5.1 Objective

Reliably read all Parquet files, decode **event bytes** (or equivalent binary payloads) into structured events the rest of the pipeline can filter and serialize.

### 5.2 In scope

- Batch or streaming read over the full corpus.
- Error handling per file (skip vs fail — document choice).
- Normalization to in-memory structures: positions, event list, identifiers.

### 5.3 Out of scope

- Pixel coordinates (Phase 4); match-level aggregation polish (Phase 3).

### 5.4 Inputs

- All `.parquet` from Phase 1 contract.

### 5.5 Outputs

- In-memory representation: rows or grouped records with decoded event types and timestamps **as read** (before match-relative normalization).

### 5.6 Detailed tasks

1. Implement reader loop in `scripts/process_data.py` (or split modules if preferred).
2. Decode event bytes per README; map to string event types (`Kill`, `Loot`, `BotKill`, …).
3. Attach `user_id` / file ownership so later steps know “subject = human whose file this is.”

### 5.7 Acceptance criteria

- Full corpus read completes; counts logged (files, rows, events).
- Spot-check: known file produces expected event type distribution.

---

## 6. Phase 3 — Timestamps, grouping, human/bot tagging

### 6.1 Objective

Turn raw timestamps into **seconds from match start**, group all rows by **`match_id`**, and tag **human vs bot** players for UI filters.

### 6.2 In scope

- **`ts` normalization:** raw values may look epoch-like (e.g. near 1970-01-21). Treat as **time elapsed within the match** per README; **per match**, set `min(ts) → 0` and express others as seconds (or ms → s if applicable).
- **Duration inference:** no explicit match end event → `duration_s = max(ts) - min(ts)` (or equivalent over all players in match). Document that this may **undercount** if everyone dies/extracts early.
- **Grouping:** nested structure `match_id → players → arrays`.
- **Tagging:** `is_bot` on each player record for filters.

### 6.3 Out of scope

- Dropping single-player matches — **do not** filter out matches with only one player file (solo bot or incomplete data remains visible).

### 6.4 Inputs

- Decoded structures from Phase 2.

### 6.5 Outputs

- Grouped match objects with normalized `ts`, `duration_s`, `human_count`, `bot_count`, `player_count`.

### 6.6 Detailed tasks

1. For each match, compute `t0 = min(ts)` across all included series; subtract for all position and event times.
2. Aggregate player list; compute counts.
3. Persist rules for bot detection (column vs heuristic) in code comments.

### 6.7 Acceptance criteria

- Random match: first position/event time is 0 (within float tolerance).
- `duration_s` matches spread of timestamps in spot-check.

---

## 7. Phase 4 — World → pixel & JSON emission

### 7.1 Objective

Convert game world `(x, z)` to **pixel coordinates** in a **1024×1024** minimap space and emit **chunked JSON** plus **`matches_index.json`**.

### 7.2 In scope

- Per-map **`scale`** and **`origin`** (see [§19 Coordinate mapping](#19-coordinate-mapping)).
- Formula after minimaps are standardized to 1024²:

  ```
  u = (x - origin_x) / scale
  v = (z - origin_z) / scale
  pixel_x = u * 1024
  pixel_y = (1 - v) * 1024    // Y-flip: image top-left vs game bottom-left
  ```

- **Chunking:** one file per **`{map}_{date}`** (e.g. `AmbroseValley_Feb10.json`), **~200KB–1MB** each — not a single ~10MB JSON.
- **Compact arrays:** for each player, parallel `px[]`, `pz[]`, `ts[]`; `events[]` as small objects with `t`, `type`, `px`, `pz`.
- **Index file:** ~2KB `matches_index.json` for map/date/match metadata picker.

### 7.3 Out of scope

- Serving JSON from a dynamic API (static files only).

### 7.4 Inputs

- Grouped matches from Phase 3; map name and date on each match.

### 7.5 Outputs (artifacts)

- `public/data/matches_index.json`
- `public/data/{MapName}_{MonDD}.json` (exact naming convention as implemented)
- Optional: manifest or build log with file sizes

### 7.6 Detailed tasks

1. Implement map config table (AmbroseValley, GrandRift, Lockdown) in code or YAML.
2. Apply transform to every position sample and event `x,z` (ignore `y` for 2D minimap).
3. Serialize with stable key ordering if desired (easier diffs).
4. **Position volume:** positions are ~**85%** of data — optionally **pre-downsample** for path arrays (e.g. every 3rd point) **in JSON** to shrink payload, **or** downsample only at render time; if pre-done, keep **full** series somewhere for heatmaps or duplicate arrays (`px_all` vs `px_path`) — architecture choice: **paths use 3× downsample; heatmaps use full density** (see Phase 12).

### 7.7 Acceptance criteria

- Each chunk loads in isolation; no cross-chunk required for one map+date view.
- Total browser fetch for one selection in **~200KB–1MB** range (per design).

---

## 8. Phase 5 — Minimap resize & asset pipeline

### 8.1 Objective

Produce **1024×1024** PNG (or agreed format) minimaps so the README UV math applies uniformly. Originals differ in size; GrandRift is not perfectly square.

### 8.2 In scope

- **Source dimensions (actual):**

  | Map | Actual image size |
  |-----|-------------------|
  | AmbroseValley | 4320 × 4320 |
  | GrandRift | 2160 × 2158 |
  | Lockdown | 9000 × 9000 |

- README may assume 1024² — **resize at build time** to 1024².
- **GrandRift:** pad **2px** on bottom (or consistent edge) so result is 1024×1024; visually negligible, keeps math uniform.

### 8.3 Out of scope

- Shipping 9000px images to the client (too large; e.g. ~2.5MB+ per huge JPG).

### 8.4 Outputs

- `public/data/minimaps/AmbroseValley.png` (1024×1024)
- `public/data/minimaps/GrandRift.png` (1024×1024)
- `public/data/minimaps/Lockdown.png` (1024×1024)

### 8.5 Detailed tasks

1. Script or step in ETL: load source image, resize with aspect-preserving logic + pad if needed.
2. Verify file names match what the frontend expects.
3. Optimize PNG/JPEG tradeoff for weight vs clarity (document choice).

### 8.6 Acceptance criteria

- All three open as 1024×1024 in an image inspector.
- Canvas draws minimap without separate scaling hacks per map beyond uniform transform.

---

## 9. Phase 6 — Offline coordinate validation

### 9.1 Objective

Prove world → pixel mapping against real data **outside** the browser (matplotlib or similar).

### 9.2 In scope

- `scripts/validate_coords.py`: load a **known** AmbroseValley match, plot **500+** position events on the minimap image.
- Visual check: paths follow **roads** and cluster near **buildings**.

### 9.3 Outputs

- Validation script; optional saved PNG artifacts for documentation (not required in repo if large).

### 9.4 Acceptance criteria

- Stakeholder sign-off that overlay aligns with geography.
- Regression: script rerunnable after ETL changes.

---

## 10. Phase 7 — App scaffold

### 10.1 Objective

Boot a **TypeScript** SPA with **Tailwind**, **Zustand**, and project structure that will host the canvas visualizer.

### 10.2 In scope

- Vite + React 18 + TS template; strict TS if team prefers.
- Tailwind configured; dark theme base classes.
- Zustand installed; empty or stub store.
- Lint/format/CI optional but recommended.

### 10.3 Out of scope

- Canvas implementation.

### 10.4 Acceptance criteria

- `npm run dev` shows shell UI; `npm run build` emits static assets deployable to Vercel.

---

## 11. Phase 8 — Index + chunk loading

### 11.1 Objective

At runtime, load **`matches_index.json`**, let the user pick **map + date**, then **`fetch`** only the corresponding chunk JSON.

### 11.2 In scope

- Fetch on boot: index.
- Lazy fetch: `{map}_{date}.json` on selection change.
- TypeScript types/interfaces matching [§18 JSON schema](#18-json-schema-per-mapdate-chunk).
- Loading / error UI (spinner, retry, 404 message).
- Zustand slices (example fields — adjust to implementation):

  - `selectedMap`, `selectedDate`, `selectedMatchId`
  - `chunkData`, `chunkStatus: 'idle' | 'loading' | 'ok' | 'error'`
  - `index`, `indexStatus`

### 11.3 Out of scope

- Drawing data (Phase 9+).

### 11.4 Acceptance criteria

- Network tab shows **no** multi-megabyte JSON until user selects a chunk.
- First meaningful paint **under ~2s** on a typical connection (target from chunked design).

---

## 12. Phase 9 — Multi-layer canvas & sizing

### 12.1 Objective

Create **stacked canvases** (or one canvas with logical layers — prefer **multi-canvas stack** for clarity and layer clears) and handle **DPR** + container resize.

### 12.2 In scope

- **Layer order (bottom → top):**
  - **Layer 0:** Minimap image (drawImage)
  - **Layer 1:** Path lines
  - **Layer 2:** Event markers
  - **Layer 3:** Heatmap (`simpleheat` target canvas)
  - **Layer 4:** Selection / hover highlights

- Reason: ~**89K** events — **SVG is out**; Canvas is required.

### 12.3 Detailed tasks

1. React components or hooks: one wrapper with `position: relative`, canvases `absolute` full size.
2. Set canvas `width`/`height` in **device pixels**; CSS size in layout pixels; scale context for DPR.
3. Central **transform** object: `scale`, `offsetX`, `offsetY` (or 2×2 matrix + translation) applied consistently to all layers that share world space.

### 12.4 Acceptance criteria

- Resizing window redraws without blur (correct DPR).
- Layer 0 shows correct minimap for selected map.

---

## 13. Phase 10 — Zoom, pan & coordinate unification

### 13.1 Objective

Implement **wheel zoom** and **drag pan** (or chosen UX) using **Canvas transforms**, not a DOM zoom library that breaks pointer ↔ canvas mapping.

### 13.2 In scope

- Pointer events: map client coordinates → **minimap 1024 space** before drawing.
- Clamp or bounce at edges (product decision).
- Optional: minimap overview — if present, must share same math as main view.

### 13.3 Out of scope

- `react-zoom-pan-pinch` on the canvas subtree (explicitly avoided).

### 13.4 Acceptance criteria

- Paths drawn in Phase 11 stay glued to terrain under zoom/pan.
- Heatmap aligns with paths (same transform).

---

## 14. Phase 11 — Paths, downsampling & playback

### 14.1 Objective

Render player **paths** from `px`/`pz`/`ts` efficiently and drive **time** via scrubber + **`requestAnimationFrame`**.

### 14.2 In scope

- **Drawing:** iterate parallel arrays; `lineTo` strips; stroke per player or by team/human/bot.
- **Downsampling:** render every **3rd** point for paths if full series present — paths should look **visually identical** to full resolution while cutting draw cost.
- **Playback clock:** single `currentTimeS` in Zustand (or ref + subscribe); rAF loop updates derived state or triggers draw.
- **Binary search** on sorted `ts` to find index for “position at `t`” (for head markers or future features).

### 14.3 Out of scope

- Heatmap density (Phase 12).

### 14.4 Acceptance criteria

- Scrubbing time updates path clipping or “trail length” per spec (implement either “full path dimmed + bright segment” or “only draw up to `t`” — document chosen UX).
- No frame collapse when many players visible (profile; reduce stroke cost if needed).

---

## 15. Phase 12 — Events, heatmaps & filters

### 15.1 Objective

Overlay **discrete events**, **`simpleheat`** density, and wire **filters** to Zustand.

### 15.2 In scope

- **Events:** for each player, draw `events[]` where `event.t <= currentTimeS` (and/or visible window) at `(px, pz)` with glyph/color by `type`.
- **Heatmap:** `simpleheat` on Layer 3; feed **all** position points (or full-rate samples) — **not** the 3× downsampled path data.
- **Filters:** show/hide bots, filter event types, pick match from match list; sync from UI → store → redraw.

### 15.3 Detailed tasks

1. Add `simpleheat` dependency; size heatmap canvas to match stack.
2. Rebuild heatmap when map/date/match/filter changes (debounce if expensive).
3. Legend for event types and heatmap intensity.

### 15.4 Acceptance criteria

- Toggling bot visibility removes/adds bot paths and events consistently.
- Heatmap reflects dense areas matching intuition from raw points.

---

## 16. Phase 13 — Interaction, edge-case UI & deploy

### 16.1 Objective

Ship a **polished** analyst-facing tool: pointer feedback, honest labels for incomplete data, correct **event semantics** in UI copy, and **Vercel** deployment.

### 16.2 In scope

- **Layer 4:** hover hit-test (approximate: grid / spatial hash / simple distance threshold) and selection state.
- **Feb 14:** only **79** files — label **“(partial)”** in UI per README.
- **Tooltips / docs:** event naming — subject is always the **human player whose file it is**:
  - `Kill` — human killed human  
  - `BotKill` — human killed bot  
  - `Killed` — human died to human  
  - `BotKilled` — human died to bot  
- **Performance:** avoid allocating objects per frame in hot paths.
- **Deploy:** Vercel project linked to repo; `public/data` included in build output.

### 16.3 Out of scope

- Backend CRUD; live Parquet ingestion in the browser.

### 16.4 Acceptance criteria

- Production URL loads; all chunks and minimaps resolve with correct cache headers (Vercel defaults OK).
- QA passes checklist: partial day label, filter matrix, mobile/tablet layout if in scope.

---

## 17. Data flow (build + runtime)

```
RAW DATA (build time)                    BROWSER (runtime)
─────────────────────                    ─────────────────

1,243 .parquet files                     React App loads
(8 MB across 5 days)                         │
        │                                    ▼
        ▼                               Fetch matches_index.json
Python ETL                                 (2KB — match metadata)
(scripts/process_data.py)                    │
        │                                   ▼
        ├─ Read all parquet files        User picks Map + Date
        ├─ Decode event bytes                │
        ├─ Tag human vs bot                  ▼
        ├─ World coords → pixel coords   Fetch {map}_{date}.json
        ├─ Normalize timestamps           (200KB–1MB per chunk)
        ├─ Group by match_id                 │
        │                                    ▼
        ▼                               Canvas renders:
public/data/                             Layer 0: Minimap image
├── matches_index.json                   Layer 1: Path lines
├── AmbroseValley_Feb10.json             Layer 2: Event markers
├── AmbroseValley_Feb11.json             Layer 3: Heatmap overlay
├── GrandRift_Feb10.json                 Layer 4: Selection/hover
├── ...                                      │
├── minimaps/                                ▼
│   ├── AmbroseValley.png (1024×1024)    Playback engine
│   ├── GrandRift.png (1024×1024)        (requestAnimationFrame)
│   └── Lockdown.png (1024×1024)         advances time filter
```

---

## 18. JSON schema (per map/date chunk)

```jsonc
{
  "matches": {
    "{match_id}": {
      "map": "AmbroseValley",
      "date": "2026-02-10",
      "duration_s": 482.5,
      "player_count": 15,
      "human_count": 5,
      "bot_count": 10,
      "players": {
        "{user_id}": {
          "is_bot": false,
          // Compact arrays — parallel indexed. Positions are pre-converted to pixel coords.
          "px": [78, 82, 91, ...],     // pixel x (0–1024)
          "pz": [890, 885, 872, ...],  // pixel y (0–1024)
          "ts": [0.0, 1.2, 2.4, ...],  // seconds from match start
          "events": [
            { "t": 45.2, "type": "Kill", "px": 340, "pz": 520 },
            { "t": 120.8, "type": "Loot", "px": 355, "pz": 510 }
          ]
        }
      }
    }
  }
}
```

**Why this shape**

- **Fast path rendering:** parallel `px`/`pz`/`ts` draw without per-point object allocation on the hot loop.
- **Compact JSON:** no repeated `user_id` / `match_id` / `map` on every sample row.
- **Playback:** sorted `ts` enables binary search for current time.
- **Lazy loading:** only the active `{map}_{date}` file is fetched.

---

## 19. Coordinate mapping

### 19.1 Problem

Game world uses 3D `(x, y, z)` with **`y` = elevation**. Minimap is 2D top-down using **`x`** (horizontal) and **`z`** (depth). Each map has its own **scale** and **origin**.

### 19.2 Solution

Standardize minimaps to **1024×1024** at build time (see Phase 5). Then:

```
u = (x - origin_x) / scale
v = (z - origin_z) / scale

pixel_x = u * 1024
pixel_y = (1 - v) * 1024     // Y-flip: image origin top-left, game origin bottom-left
```

### 19.3 Map configs

```
AmbroseValley:  scale=900,  origin=(-370, -473)
GrandRift:      scale=581,  origin=(-290, -290)
Lockdown:       scale=1000, origin=(-500, -500)
```

### 19.4 README vs actual assets

README may assume 1024² originals; actual sources are larger/non-square (see Phase 5 table). **Resizing** makes the documented formula accurate.

---

## 20. Assumptions & ambiguities

| Issue | Decision | Reasoning |
|-------|----------|-----------|
| `ts` field looks like epoch datetime (e.g. 1970-01-21…) | Treat as match-relative; normalize to **seconds from match start** (`min ts` per match = 0) | README: time elapsed within match |
| February 14 has only 79 files | Include data; label **“(partial)”** in UI | Data collection still ongoing |
| Some matches have only 1 player file | Still show | Solo bot or incomplete data; filtering ≥2 would lose valid cases |
| GrandRift minimap 2160×2158 (not square) | Resize to 1024×1024, **pad 2px** on bottom | Imperceptible; uniform math |
| Position events ~85% of volume | **3× downsample** for path rendering; **use all** (or full rate) for heatmaps | Paths look identical; heatmaps need density |
| No explicit match start/end event | Infer duration from **first to last** event timestamp per match | May slightly undercount true match length |
| Meaning of `BotKill` | **Human killed a bot** (not “bot got a kill”) | Subject = human whose file it is; naming convention |

---

## 21. Major tradeoffs

| Decision | Chose | Over | Why |
|----------|-------|------|-----|
| **Pre-process to JSON** | Static JSON at build time | Runtime Parquet (`parquet-wasm`, etc.) | Simpler, faster load, works everywhere; tradeoff: rebuild for new data |
| **Canvas rendering** | HTML5 Canvas multi-layer | SVG / deck.gl / Leaflet | Performance at ~89K events; SVG element count too high; deck.gl overkill; Leaflet tiles fight custom image minimap |
| **Split JSON by map+date** | Chunked ~200KB–1MB | Single ~10MB JSON | First paint **< ~2s** target; user loads only current view |
| **1024px minimap** | Resize to uniform 1024² | Ship originals up to 9000px | Consistent coordinate math; smaller downloads |
| **Zustand** | Lightweight store | React Context / Redux | One import, minimal boilerplate for medium complexity |
| **No backend server** | Fully static SPA | Express / Flask API | Fixed 5-day dataset; no auth/writes; free hosting, zero ops |

---

## 22. Event type semantics

All interpretations assume the event row belongs to the **human player file** (the subject is that human).

| Type | Meaning |
|------|---------|
| `Kill` | Human killed another **human** |
| `BotKill` | Human killed a **bot** |
| `Killed` | Human **died** to another **human** |
| `BotKilled` | Human **died** to a **bot** |

Use these consistently in filters, legends, and analytics copy to avoid inverted interpretations.

---

## 23. Validation

Coordinate mapping was verified by plotting **500+** position events from a known **AmbroseValley** match onto the minimap in **matplotlib**; player paths follow **roads** and cluster near **buildings**, confirming the transform. Script: `scripts/validate_coords.py`.

---

## 24. Appendix — `public/data` layout

```
public/data/
├── matches_index.json
├── {MapName}_{Date}.json       # one per map+day chunk, e.g. AmbroseValley_Feb10.json
├── ...
└── minimaps/
    ├── AmbroseValley.png       # 1024 × 1024
    ├── GrandRift.png
    └── Lockdown.png
```

---

## 25. Master phase checklist (all phases)

Use this table to track completion; it duplicates the canonical phase list.

| # | Phase | Done |
|---|-------|------|
| 1 | Environment & data contract | ☐ |
| 2 | Parquet ingest & decode | ☐ |
| 3 | Timestamps, grouping, human/bot | ☐ |
| 4 | World → pixel & JSON emission | ☐ |
| 5 | Minimap resize & `public/data` layout | ☐ |
| 6 | Offline coordinate validation | ☐ |
| 7 | App scaffold (Vite/React/TS/Tailwind/Zustand) | ☐ |
| 8 | Index + chunk loading + types | ☐ |
| 9 | Multi-layer canvas & sizing | ☐ |
| 10 | Zoom, pan & coordinate unification | ☐ |
| 11 | Paths, downsampling & playback | ☐ |
| 12 | Events, heatmaps & filters | ☐ |
| 13 | Interaction, edge-case UI & deploy | ☐ |

---

*End of architecture document.*
