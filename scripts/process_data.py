#!/usr/bin/env python3
"""
Parquet → static JSON chunks + matches_index.json (Phase 2–5).

Expected columns (aliases resolved automatically):
  match_id / matchId / MatchId
  user_id / userId / player_id / PlayerId
  map / map_name / Map / MapName
  date / match_date (ISO date string or datetime); optional — can use --default-date
  x, z world coords (x / world_x / pos_x, z / world_z / pos_z); y ignored for 2D minimap
  ts / time / timestamp — match-relative or raw (normalized per match to seconds from min)
  event_type / type / EventType — optional; non-empty => row also recorded as an event
  is_bot / bot / IsBot — optional bool; else heuristic from user_id prefix "bot"

Outputs:
  public/data/matches_index.json
  public/data/{Map}_{MonDD}.json
  public/data/minimaps/{Map}.png  (resized from --minimap-src-dir)

See architechture.md §18–§19.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from collections import defaultdict
from datetime import date, datetime
from pathlib import Path
from typing import Any

import pandas as pd
from PIL import Image

MAP_SIZE = 1024

MAP_WORLD: dict[str, dict[str, float]] = {
    "AmbroseValley": {"scale": 900, "origin_x": -370, "origin_z": -473},
    "GrandRift": {"scale": 581, "origin_x": -290, "origin_z": -290},
    "Lockdown": {"scale": 1000, "origin_x": -500, "origin_z": -500},
}


def resolve_col(df: pd.DataFrame, *candidates: str) -> pd.Series:
    lower = {str(c).lower(): c for c in df.columns}
    for c in candidates:
        if c in df.columns:
            return df[c]
        if c.lower() in lower:
            return df[lower[c.lower()]]
    raise KeyError(f"None of {candidates} in columns: {list(df.columns)}")


def world_to_pixel(map_name: str, x: float, z: float) -> tuple[float, float]:
    cfg = MAP_WORLD.get(map_name)
    if not cfg:
        raise ValueError(f"Unknown map {map_name!r}; add to MAP_WORLD in process_data.py")
    scale = cfg["scale"]
    ox, oz = cfg["origin_x"], cfg["origin_z"]
    u = (x - ox) / scale
    v = (z - oz) / scale
    px = u * MAP_SIZE
    pz = (1 - v) * MAP_SIZE
    return px, pz


def date_key(d: date) -> str:
    return f"{d.strftime('%b')}{d.day}"


def series_bot(bot_s: pd.Series | None, uid_s: pd.Series) -> pd.Series:
    if bot_s is None:
        return uid_s.astype(str).str.lower().str.startswith("bot")
    if pd.api.types.is_bool_dtype(bot_s):
        return bot_s.fillna(False)
    if pd.api.types.is_numeric_dtype(bot_s):
        return bot_s.fillna(0).astype(int).ne(0)
    return bot_s.astype(str).str.lower().isin(("1", "true", "yes", "t"))


def normalize_event_value(v: Any) -> str:
    if isinstance(v, bytes):
        try:
            return v.decode("utf-8", errors="ignore").strip()
        except Exception:
            return ""
    if v is None:
        return ""
    return str(v).strip()


def parse_ts_series(ts: pd.Series) -> pd.Series:
    """Convert ts column to numeric for match-relative normalization."""
    if pd.api.types.is_datetime64_any_dtype(ts):
        # nanoseconds epoch -> convert to milliseconds for stable scaling later.
        return ts.astype("int64") / 1_000_000.0
    out = pd.to_numeric(ts, errors="coerce")
    if out.notna().any():
        return out
    parsed = pd.to_datetime(ts, errors="coerce")
    if parsed.notna().any():
        return parsed.astype("int64") / 1_000_000.0
    return out


def infer_day_from_path(path_str: str) -> date | None:
    s = path_str.replace("\\", "/")
    m = re.search(r"February[_\-\s]?(\d{1,2})", s, flags=re.IGNORECASE)
    if m:
        return date(2026, 2, int(m.group(1)))
    m = re.search(r"(2026)[_\-/](\d{2})[_\-/](\d{2})", s)
    if m:
        return date(int(m.group(1)), int(m.group(2)), int(m.group(3)))
    return None


def read_parquet_dir(raw_dir: Path) -> pd.DataFrame:
    files = sorted(f for f in raw_dir.rglob("*") if f.is_file())
    if not files:
        print(f"No files under {raw_dir}", file=sys.stderr)
        return pd.DataFrame()
    frames: list[pd.DataFrame] = []
    read_ok = 0
    read_fail = 0
    for f in files:
        lower = f.name.lower()
        # Common real-world shape from dataset README: files have no .parquet extension and end with .nakama-0.
        if not (lower.endswith(".parquet") or lower.endswith(".nakama-0") or "." not in f.name):
            continue
        try:
            frame = pd.read_parquet(f)
            frame["__source_path"] = str(f)
            frames.append(frame)
            read_ok += 1
        except Exception as e:
            read_fail += 1
            print(f"SKIP non-parquet or unreadable file {f}: {e}", file=sys.stderr)
    if not frames:
        print(f"No readable parquet-like files under {raw_dir}", file=sys.stderr)
        return pd.DataFrame()
    print(f"Read files: {read_ok}, skipped: {read_fail}", file=sys.stderr)
    return pd.concat(frames, ignore_index=True)


def add_ts_sec_per_match(work: pd.DataFrame) -> pd.DataFrame:
    """Seconds from match start; treat large raw values as milliseconds."""
    parts: list[pd.DataFrame] = []
    for _, gm in work.groupby("match_id"):
        t = gm["ts_raw"].astype("float64")
        t0 = t.min()
        if (t.max() or 0) > 1e12:
            sec = (t - t0) / 1000.0
        else:
            sec = t - t0
        gm = gm.copy()
        gm["ts_sec"] = sec.values
        parts.append(gm)
    return pd.concat(parts, ignore_index=True)


def build_matches(
    df: pd.DataFrame,
    default_date: date | None,
    partial_dates: set[str],
) -> tuple[dict[tuple[str, str], dict], list[dict]]:
    """Return chunks dict (map, date_key) -> { matches: {...} }, and index rows."""
    if df.empty:
        return {}, []

    # Resolve columns with fallbacks
    mid = resolve_col(df, "match_id", "matchId", "MatchId")
    uid = resolve_col(df, "user_id", "userId", "player_id", "PlayerId")
    try:
        mmap = resolve_col(df, "map", "map_id", "map_name", "Map", "MapName")
    except KeyError:
        mmap = pd.Series(["AmbroseValley"] * len(df))

    x = None
    for name in ("x", "world_x", "pos_x", "X"):
        if name in df.columns:
            x = df[name]
            break
    z = None
    for name in ("z", "world_z", "pos_z", "Z"):
        if name in df.columns:
            z = df[name]
            break
    if x is None or z is None:
        raise KeyError(f"Need x/z world columns; have {list(df.columns)}")

    ts = None
    for name in ("ts", "time", "timestamp", "t"):
        if name in df.columns:
            ts = df[name]
            break
    if ts is None:
        raise KeyError(f"Need ts/time column; have {list(df.columns)}")

    evt = None
    for name in ("event_type", "type", "EventType", "event"):
        if name in df.columns:
            evt = df[name]
            break

    bot = None
    for name in ("is_bot", "bot", "IsBot"):
        if name in df.columns:
            bot = df[name]
            break

    dcol = None
    for name in ("date", "match_date", "day"):
        if name in df.columns:
            dcol = df[name]
            break

    work = pd.DataFrame(
        {
            "match_id": mid.astype(str),
            "user_id": uid.astype(str),
            "map": mmap.astype(str),
            "x": pd.to_numeric(x, errors="coerce"),
            "z": pd.to_numeric(z, errors="coerce"),
            "ts_raw": parse_ts_series(ts),
            "event_type": evt.map(normalize_event_value) if evt is not None else pd.Series([""] * len(df)),
            "is_bot": series_bot(bot, uid),
        }
    )
    if dcol is not None:

        def parse_day(v: Any) -> date:
            if isinstance(v, datetime):
                return v.date()
            if isinstance(v, date):
                return v
            s = str(v)[:10]
            return datetime.fromisoformat(s).date()

        work["day"] = dcol.map(parse_day)
    elif "__source_path" in df.columns:
        inferred = df["__source_path"].map(lambda p: infer_day_from_path(str(p)))
        if inferred.notna().any():
            work["day"] = inferred.fillna(default_date if default_date else inferred.dropna().iloc[0])
        elif default_date:
            work["day"] = default_date
        else:
            raise ValueError(
                "No date column and path inference failed. Provide --default-date YYYY-MM-DD."
            )
    elif default_date:
        work["day"] = default_date
    else:
        raise ValueError("No date column and no --default-date")

    work = work.dropna(subset=["x", "z", "ts_raw"])
    work = add_ts_sec_per_match(work)

    chunks: dict[tuple[str, str], dict[str, Any]] = defaultdict(
        lambda: {"matches": {}}
    )
    index_rows: list[dict] = []

    for (map_name, day), g in work.groupby(["map", "day"]):
        dk = date_key(day)
        g = g.sort_values("ts_sec")
        for match_id, gm in g.groupby("match_id"):
            players: dict[str, Any] = {}
            for user_id, gu in gm.groupby("user_id"):
                is_bot = bool(gu["is_bot"].iloc[0])
                px_list: list[float] = []
                pz_list: list[float] = []
                ts_list: list[float] = []
                events: list[dict] = []
                for _, row in gu.sort_values("ts_sec").iterrows():
                    x_, z_ = float(row["x"]), float(row["z"])
                    try:
                        px, pz = world_to_pixel(map_name, x_, z_)
                    except ValueError:
                        continue
                    tsec = float(row["ts_sec"])
                    px_list.append(round(px, 2))
                    pz_list.append(round(pz, 2))
                    ts_list.append(round(tsec, 3))
                    et = str(row["event_type"]).strip()
                    if et and et.lower() not in ("nan", "none", ""):
                        events.append(
                            {
                                "t": round(tsec, 3),
                                "type": et,
                                "px": round(px, 2),
                                "pz": round(pz, 2),
                            }
                        )
                if not px_list:
                    continue
                players[user_id] = {
                    "is_bot": is_bot,
                    "px": px_list,
                    "pz": pz_list,
                    "ts": ts_list,
                    "events": events,
                }
            if not players:
                continue
            humans = sum(1 for p in players.values() if not p["is_bot"])
            bots = sum(1 for p in players.values() if p["is_bot"])
            all_ts = [t for p in players.values() for t in p["ts"]]
            duration = max(all_ts) - min(all_ts) if all_ts else 0.0
            chunks[(map_name, dk)]["matches"][match_id] = {
                "map": map_name,
                "date": day.isoformat(),
                "duration_s": round(float(duration), 3),
                "player_count": len(players),
                "human_count": humans,
                "bot_count": bots,
                "players": players,
            }

        mcount = len(chunks[(map_name, dk)]["matches"])
        partial = dk in partial_dates or any(
            p in str(day) for p in partial_dates
        )
        if mcount > 0:
            index_rows.append(
                {
                    "map": map_name,
                    "dateKey": dk,
                    "file": f"{map_name}_{dk}.json",
                    "partial": partial,
                    "matchCount": mcount,
                }
            )

    flat = {f"{m}_{d}": data for (m, d), data in chunks.items()}
    index_list = sorted(index_rows, key=lambda r: (r["map"], r["dateKey"]))
    return flat, index_list


def resize_minimap(src: Path, dst: Path, map_name: str) -> None:
    dst.parent.mkdir(parents=True, exist_ok=True)
    img = Image.open(src).convert("RGBA")
    w, h = img.size
    if map_name == "GrandRift" and w != h:
        # Pad height by 2px per architecture (2160×2158 → square before scale)
        pad_bottom = max(0, w - h)
        if pad_bottom:
            canvas = Image.new("RGBA", (w, w), (0, 0, 0, 0))
            canvas.paste(img, (0, 0))
            img = canvas
    img = img.resize((MAP_SIZE, MAP_SIZE), Image.Resampling.LANCZOS)
    img.save(dst, format="PNG")


def find_minimap_source(minimap_src_dir: Path, map_name: str) -> Path | None:
    exts = (".png", ".jpg", ".jpeg", ".webp")
    candidates: list[Path] = []
    for p in minimap_src_dir.rglob("*"):
        if not p.is_file():
            continue
        lname = p.name.lower()
        if not lname.endswith(exts):
            continue
        stem = p.stem.lower()
        map_l = map_name.lower()
        # Support names like AmbroseValley.png or AmbroseValley_Minimap.png
        if stem == map_l or stem.startswith(f"{map_l}_minimap"):
            candidates.append(p)
    if not candidates:
        return None
    # Prefer exact match first, then shortest path name.
    candidates.sort(key=lambda p: (0 if p.stem.lower() == map_name.lower() else 1, len(str(p))))
    return candidates[0]


def main() -> int:
    ap = argparse.ArgumentParser(description="LILA BLACK Parquet → JSON ETL")
    ap.add_argument(
        "--raw-dir",
        type=Path,
        default=Path("data/raw"),
        help="Directory containing .parquet files (recursive)",
    )
    ap.add_argument(
        "--out-dir",
        type=Path,
        default=Path("public/data"),
        help="Output directory (matches_index + chunks + minimaps)",
    )
    ap.add_argument(
        "--minimap-src-dir",
        type=Path,
        default=Path("data/minimaps_source"),
        help="Source minimap images named {MapName}.png/.jpg",
    )
    ap.add_argument(
        "--default-date",
        type=str,
        default=None,
        help="ISO date if Parquet has no date column",
    )
    ap.add_argument(
        "--partial-dates",
        type=str,
        default="",
        help="Comma-separated dateKeys e.g. Feb14 to mark partial in index",
    )
    args = ap.parse_args()

    partial_dates = {x.strip() for x in args.partial_dates.split(",") if x.strip()}
    default_date = (
        datetime.fromisoformat(args.default_date).date() if args.default_date else None
    )

    df = read_parquet_dir(args.raw_dir)
    if df.empty:
        print("No data; nothing written.", file=sys.stderr)
        return 1

    flat_chunks, index_list = build_matches(df, default_date, partial_dates)
    args.out_dir.mkdir(parents=True, exist_ok=True)

    index_path = args.out_dir / "matches_index.json"
    index_path.write_text(
        json.dumps({"chunks": index_list}, indent=2) + "\n", encoding="utf-8"
    )
    print("Wrote", index_path)

    for name, data in flat_chunks.items():
        # name is Map_DateKey
        p = args.out_dir / f"{name}.json"
        p.write_text(json.dumps({"matches": data["matches"]}, indent=2) + "\n", encoding="utf-8")
        print("Wrote", p, "matches:", len(data["matches"]))

    minimap_out = args.out_dir / "minimaps"
    for m in MAP_WORLD:
        src = find_minimap_source(args.minimap_src_dir, m)
        if src:
            resize_minimap(src, minimap_out / f"{m}.png", m)
            print("Minimap", m, "from", src)
        else:
            print("WARN: no source minimap for", m, "— skip resize", file=sys.stderr)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
