from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import matplotlib.pyplot as plt
import streamlit as st
from PIL import Image

ROOT = Path(__file__).resolve().parent
DATA_DIR = ROOT / "public" / "data"
MINIMAP_DIR = DATA_DIR / "minimaps"

EVENT_COLORS: dict[str, str] = {
    "Kill": "#ef4444",
    "BotKill": "#f97316",
    "Killed": "#a855f7",
    "BotKilled": "#8b5cf6",
    "Loot": "#22c55e",
    "Extract": "#06b6d4",
    "Death": "#64748b",
    "KilledByStorm": "#eab308",
}


@st.cache_data(show_spinner=False)
def load_index() -> dict[str, Any]:
    return json.loads((DATA_DIR / "matches_index.json").read_text(encoding="utf-8"))


@st.cache_data(show_spinner=False)
def load_chunk(map_name: str, date_key: str) -> dict[str, Any]:
    p = DATA_DIR / f"{map_name}_{date_key}.json"
    return json.loads(p.read_text(encoding="utf-8"))


def main() -> None:
    st.set_page_config(page_title="LILA BLACK Streamlit Viewer", layout="wide")
    st.title("LILA BLACK - Streamlit Test UI")
    st.caption("Quick testing app for chunks, minimaps, paths and event color reference.")

    if not (DATA_DIR / "matches_index.json").exists():
        st.error("`public/data/matches_index.json` not found. Run ETL first.")
        return

    idx = load_index()
    chunks = idx.get("chunks", [])
    if not chunks:
        st.error("No chunks found in index.")
        return

    left, right = st.columns([1, 2])
    with left:
        chunk_labels = [
            f"{c['map']} | {c['dateKey']}" + (" (partial)" if c.get("partial") else "")
            for c in chunks
        ]
        selected_label = st.selectbox("Select map/date chunk", chunk_labels, index=0)
        selected = chunks[chunk_labels.index(selected_label)]
        map_name = selected["map"]
        date_key = selected["dateKey"]
        st.write(f"Matches in chunk: **{selected.get('matchCount', 0)}**")

        chunk = load_chunk(map_name, date_key)
        match_ids = sorted(chunk.get("matches", {}).keys())
        if not match_ids:
            st.warning("No matches in selected chunk.")
            return
        match_id = st.selectbox("Select match", match_ids)
        match = chunk["matches"][match_id]
        players = match.get("players", {})
        player_ids = sorted(players.keys())
        selected_players = st.multiselect(
            "Players to draw (empty = all)", player_ids, default=player_ids[: min(10, len(player_ids))]
        )
        if not selected_players:
            selected_players = player_ids

        event_types = list(EVENT_COLORS.keys())
        active_events = st.multiselect("Event types", event_types, default=event_types)

        st.markdown("#### Event color reference")
        for et in event_types:
            st.markdown(
                f"<span style='color:{EVENT_COLORS[et]};font-size:18px'>●</span> "
                f"<span style='font-size:14px'>{et}</span>",
                unsafe_allow_html=True,
            )

    with right:
        minimap_path = MINIMAP_DIR / f"{map_name}.png"
        if not minimap_path.exists():
            st.error(f"Minimap not found: {minimap_path}")
            return

        img = Image.open(minimap_path)
        fig, ax = plt.subplots(figsize=(9, 9))
        ax.imshow(img, extent=[0, 1024, 1024, 0], origin="upper")
        ax.set_xlim(0, 1024)
        ax.set_ylim(1024, 0)
        ax.set_title(f"{map_name} - {date_key} - {match_id}")
        ax.set_xlabel("pixel_x")
        ax.set_ylabel("pixel_y")

        for pid in selected_players:
            p = players.get(pid, {})
            px = p.get("px", [])
            pz = p.get("pz", [])
            is_bot = bool(p.get("is_bot", False))
            if px and pz:
                ax.plot(
                    px,
                    pz,
                    linewidth=0.9,
                    alpha=0.65,
                    color="#64748b" if is_bot else "#e2e8f0",
                )
            for ev in p.get("events", []):
                et = str(ev.get("type", ""))
                if et not in active_events:
                    continue
                ax.scatter(
                    ev.get("px", 0),
                    ev.get("pz", 0),
                    s=20,
                    color=EVENT_COLORS.get(et, "#94a3b8"),
                    edgecolors="black",
                    linewidths=0.2,
                    alpha=0.95,
                )

        st.pyplot(fig, clear_figure=True)
        st.caption(
            "Paths are drawn from `px/pz`; events are color-coded by type for quick visual QA."
        )


if __name__ == "__main__":
    main()

