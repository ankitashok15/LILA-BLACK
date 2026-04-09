# Insights — extracted from `architechture.md`

This file is a **high-signal distillation** of the architecture: key decisions, constraints, assumptions, and “why” behind the implementation.

---

## Product shape (what we’re building)

- **One job**: visualize player movement + behavior signals over time (paths, events, heatmaps) on a top-down minimap.
- **No backend**: fully static SPA (read-only). Dataset is fixed (multi-day capture), no auth, no writes.

---

## Key technical decisions (and why)

- **Canvas over SVG**: event/point volume (~89K) is too large for SVG/DOM; Canvas enables fast drawing and compositing.
- **Multi-layer Canvas stack**:
  - Layer 0: minimap image
  - Layer 1: paths
  - Layer 2: event markers
  - Layer 3: heatmap overlay (`simpleheat`)
  - Layer 4: hover/selection
  - Reason: isolate redraw costs (clear only what changes) + predictable z-order.
- **Zustand for state**: lightweight single source of truth for selection, filters, and playback (less boilerplate than Redux).
- **Static JSON at build time**:
  - Browser never parses Parquet (keeps runtime simple and portable).
  - Python (`pyarrow` + `pandas`) is the Parquet-native toolchain.
- **Chunking strategy**: split JSON by **map + date** (~200KB–1MB) to avoid a single large payload (~10MB) and keep first paint fast.
- **Uniform minimap size**: resize all minimaps to **1024×1024** at build time so one coordinate transform works everywhere.

---

## Data flow (build vs runtime)

### Build time

- Read ~1,243 `.parquet` files (~8MB total, ~5 days)
- Decode events
- Tag human vs bot
- Normalize timestamps per match
- Convert world coords → minimap pixels
- Output:
  - `public/data/matches_index.json` (small picker index)
  - `public/data/{Map}_{DateKey}.json` (map+date chunks)
  - `public/data/minimaps/{Map}.png` (1024×1024)

### Runtime

- App loads → fetch `matches_index.json`
- User selects Map + Date → fetch only that `{Map}_{DateKey}.json`
- Canvas renders minimap + overlays; playback runs with `requestAnimationFrame`

---

## JSON schema (why it’s shaped this way)

### Shape

- Chunk file:
  - `matches: { [match_id]: MatchRecord }`
- Match:
  - `players: { [user_id]: PlayerRecord }`
- Player:
  - Parallel arrays: `px[]`, `pz[]`, `ts[]`
  - `events[]`: `{ t, type, px, pz }`

### Why

- **Fast rendering**: arrays avoid object allocation per point in hot loops.
- **Playback-friendly**: `ts[]` supports binary search to find current index for time \(t\).
- **Compact**: avoids repeating metadata on every row.
- **Lazy-loadable**: map+date chunking matches the user workflow.

---

## Coordinate mapping (the non-negotiable math)

### World → pixel (after minimaps standardized to 1024×1024)

```
u = (x - origin_x) / scale
v = (z - origin_z) / scale

pixel_x = u * 1024
pixel_y = (1 - v) * 1024   // Y-flip: image origin top-left vs game bottom-left
```

### Map configs

```
AmbroseValley:  scale=900,  origin=(-370, -473)
GrandRift:      scale=581,  origin=(-290, -290)
Lockdown:       scale=1000, origin=(-500, -500)
```

### Why resize minimaps

- Source images are not uniformly 1024² (some are huge; GrandRift is slightly non-square).
- Resizing to 1024² makes the README formula apply consistently and keeps downloads small.

---

## Critical assumptions & ambiguities (decisions we must keep consistent)

- **Timestamp (`ts`)**:
  - May look epoch-like; treat as **match-relative time**.
  - Normalize per match: `min(ts) -> 0`, store seconds from match start.
- **Match duration**:
  - No explicit start/end event; infer `duration_s = last_ts - first_ts`.
  - May slightly undercount if match ends after last recorded player activity.
- **Partial day (Feb 14)**:
  - Fewer files (example: 79); include data but label UI as **(partial)**.
- **Single-player matches**:
  - Still show; may represent valid solo bot encounters or incomplete capture.
- **Position volume**:
  - Positions ≈ 85% of the data; use **3× downsample** for path drawing, but **full density** for heatmaps.
- **Event semantics** (subject is the human file owner):
  - `Kill`: human killed human
  - `BotKill`: human killed bot
  - `Killed`: human died to human
  - `BotKilled`: human died to bot

---

## Major tradeoffs (and their consequences)

- **Static JSON vs runtime Parquet**:
  - Pros: simpler client, faster load, works everywhere.
  - Cost: rebuilding required when new data arrives.
- **Canvas vs deck.gl / Leaflet**:
  - Pros: control + performance for custom minimap overlays.
  - Cost: you implement transforms and interaction logic yourself.
- **Chunked JSON vs single file**:
  - Pros: fast first paint, smaller per-view downloads.
  - Cost: need index + lazy load logic.
- **1024² minimaps vs originals**:
  - Pros: consistent math, smaller assets.
  - Cost: limited detail if someone later wants deep zoom beyond 1024.

---

## Phase checklist (implementation roadmap)

1. **Environment & data contract** (tooling + schema agreement)
2. **Parquet ingest & decode** (read all files + decode events)
3. **Timestamps + grouping + bot/human** (match-relative time, nested match structure)
4. **World→pixel + JSON emission** (chunks + index)
5. **Minimap resize pipeline** (1024×1024, GrandRift padding)
6. **Offline validation** (matplotlib overlay sanity)
7. **App scaffold** (Vite/React/TS/Tailwind/Zustand)
8. **Index + chunk loading** (fetch index, lazy fetch chunks)
9. **Canvas layers + DPR** (stack + sizing)
10. **Zoom/pan + unified transform** (pointer mapping correctness)
11. **Paths + downsample + playback** (rAF clock, binary search)
12. **Events + heatmaps + filters** (`simpleheat`, toggles)
13. **Interaction + edge-case UI + deploy** (hover/select, partial labels, Vercel)

