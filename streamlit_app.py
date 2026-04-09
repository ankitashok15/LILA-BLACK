from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import numpy as np
import plotly.graph_objects as go
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
        show_heatmap = st.checkbox("Show heatmap", value=True)
        heatmap_opacity = st.slider("Heatmap opacity", min_value=0.05, max_value=0.9, value=0.35, step=0.05)
        heatmap_bins = st.slider("Heatmap bins", min_value=24, max_value=128, value=64, step=8)

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
        img_w, img_h = img.size

        fig = go.Figure()
        fig.add_layout_image(
            dict(
                source=img,
                xref="x",
                yref="y",
                x=0,
                y=0,
                sizex=1024,
                sizey=1024,
                sizing="stretch",
                layer="below",
            )
        )

        heat_x: list[float] = []
        heat_y: list[float] = []

        for pid in selected_players:
            p = players.get(pid, {})
            px = p.get("px", [])
            pz = p.get("pz", [])
            is_bot = bool(p.get("is_bot", False))
            if px and pz:
                fig.add_trace(
                    go.Scattergl(
                        x=px,
                        y=pz,
                        mode="lines",
                        line=dict(
                            width=1.2,
                            color="#64748b" if is_bot else "#e2e8f0",
                        ),
                        opacity=0.65,
                        name=f"path:{pid[:8]}",
                        showlegend=False,
                        hoverinfo="skip",
                    )
                )
                heat_x.extend(px)
                heat_y.extend(pz)

            for ev in p.get("events", []):
                et = str(ev.get("type", ""))
                if et not in active_events:
                    continue
                fig.add_trace(
                    go.Scattergl(
                        x=[ev.get("px", 0)],
                        y=[ev.get("pz", 0)],
                        mode="markers",
                        marker=dict(
                            size=7,
                            color=EVENT_COLORS.get(et, "#94a3b8"),
                            line=dict(color="#0b0f19", width=0.4),
                        ),
                        name=et,
                        legendgroup=et,
                        showlegend=False,
                        hovertemplate=f"{et}<br>x=%{{x:.1f}} y=%{{y:.1f}}<extra></extra>",
                    )
                )

        # Add heatmap as a 2D density layer (toggleable)
        if show_heatmap and heat_x and heat_y:
            heat, xedges, yedges = np.histogram2d(
                np.array(heat_x, dtype=np.float32),
                np.array(heat_y, dtype=np.float32),
                bins=heatmap_bins,
                range=[[0, 1024], [0, 1024]],
            )
            fig.add_trace(
                go.Heatmap(
                    z=heat.T,
                    x=xedges,
                    y=yedges,
                    colorscale="Turbo",
                    opacity=heatmap_opacity,
                    showscale=False,
                    zsmooth="best",
                    hoverinfo="skip",
                )
            )

        # Add a proper legend reference with one dummy marker per event type
        for et in event_types:
            fig.add_trace(
                go.Scattergl(
                    x=[None],
                    y=[None],
                    mode="markers",
                    marker=dict(size=8, color=EVENT_COLORS.get(et, "#94a3b8")),
                    name=et,
                    legendgroup=et,
                    showlegend=True,
                    hoverinfo="skip",
                )
            )

        fig.update_layout(
            title=f"{map_name} - {date_key} - {match_id}",
            height=860,
            paper_bgcolor="#0b0f19",
            plot_bgcolor="#0b0f19",
            font=dict(color="#e5e7eb"),
            margin=dict(l=10, r=10, t=48, b=10),
            legend=dict(
                orientation="h",
                yanchor="bottom",
                y=1.01,
                xanchor="left",
                x=0,
                bgcolor="rgba(0,0,0,0.25)",
            ),
            dragmode="pan",
        )
        fig.update_xaxes(
            range=[0, 1024],
            showgrid=False,
            zeroline=False,
            scaleanchor="y",
            constrain="domain",
            title="pixel_x",
        )
        fig.update_yaxes(
            range=[1024, 0],  # invert y-axis to match minimap convention
            showgrid=False,
            zeroline=False,
            scaleratio=1,
            constrain="domain",
            title="pixel_y",
        )

        st.plotly_chart(fig, use_container_width=True, config={"scrollZoom": True})
        st.caption(
            "Use mouse wheel / trackpad to zoom, drag to pan. Heatmap layer is toggleable."
        )


if __name__ == "__main__":
    main()

