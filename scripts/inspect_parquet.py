#!/usr/bin/env python3
"""
Phase 1 — dry schema inspection for Parquet telemetry.
Usage: python scripts/inspect_parquet.py path/to/file.parquet
"""
from __future__ import annotations

import sys

import pyarrow.parquet as pq


def main() -> int:
    if len(sys.argv) < 2:
        print("Usage: python scripts/inspect_parquet.py <file.parquet>", file=sys.stderr)
        return 2
    path = sys.argv[1]
    pf = pq.read_table(path, columns=None)
    print("Path:", path)
    print(pf.schema)
    print("Rows:", pf.num_rows)
    if pf.num_rows > 0:
        print(pf.slice(0, min(3, pf.num_rows)).to_pandas())
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
