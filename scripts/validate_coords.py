#!/usr/bin/env python3
"""
Phase 6 — overlay position samples on a 1024 minimap (matplotlib).
Usage:
  python scripts/validate_coords.py public/data/AmbroseValley_Feb10.json public/data/minimaps/AmbroseValley.png match-demo-av-01 user_alice
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import matplotlib.pyplot as plt


def main() -> int:
    if len(sys.argv) < 5:
        print(
            "Usage: python scripts/validate_coords.py <chunk.json> <minimap.png> "
            "<match_id> <user_id>",
            file=sys.stderr,
        )
        return 2
    chunk_path = Path(sys.argv[1])
    minimap_path = Path(sys.argv[2])
    match_id = sys.argv[3]
    user_id = sys.argv[4]

    data = json.loads(chunk_path.read_text(encoding="utf-8"))
    match = data["matches"][match_id]
    player = match["players"][user_id]
    px = player["px"]
    pz = player["pz"]

    img = plt.imread(str(minimap_path))
    fig, ax = plt.subplots(figsize=(8, 8))
    ax.imshow(img, extent=[0, 1024, 1024, 0], origin="upper")
    ax.scatter(px[::1], pz[::1], s=2, c="cyan", alpha=0.6, label="positions")
    ax.set_xlim(0, 1024)
    ax.set_ylim(1024, 0)
    ax.set_title(f"{match_id} / {user_id} — {len(px)} points")
    ax.legend(loc="upper right")
    out = Path("validate_coords_out.png")
    fig.savefig(out, dpi=150, bbox_inches="tight")
    print("Wrote", out.resolve())
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
