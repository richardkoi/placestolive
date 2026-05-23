"""Export counties.sqlite to app/public/counties.json for static deployment.

The DreamHost static deploy ships scoring logic + the data file together;
the browser loads the JSON once and runs scoring locally. No backend required.

Output is a single JSON object:
  {
    "version": "<ISO timestamp>",
    "fields":  [list of column names],
    "rows":    [[...], [...], ...]
  }

We use [columnar fields + row arrays] rather than [array of objects] because
it's ~2x smaller before gzip (column names aren't repeated per row).

Run as: python -m data_pipeline.export_json
"""
from __future__ import annotations

import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DB_PATH = ROOT / "data" / "counties.sqlite"
OUT_PATH = ROOT / "app" / "public" / "counties.json"

# Fields that are useless in the browser. Drop to shrink payload.
DROP_FIELDS = {
    "state_fips",          # 2 chars; already in `fips`
    "land_area_sqmi",      # could be useful but not used yet
    "median_tax_paid",     # already derived into property_tax_pct
    "summer_avg_f",        # only used to derive dew point; we have direct dew now
    "annual_avg_f",        # not used
    "fema_winter_weather", # not exposed as a dim
    "fema_drought",        # not exposed as a dim
}


def run() -> None:
    if not DB_PATH.exists():
        raise SystemExit(
            f"counties.sqlite not found at {DB_PATH}. "
            "Run `python -m data_pipeline.build_db` first."
        )

    with sqlite3.connect(DB_PATH) as conn:
        cur = conn.cursor()
        cur.execute("PRAGMA table_info(counties)")
        all_fields = [r[1] for r in cur.fetchall()]
        fields = [f for f in all_fields if f not in DROP_FIELDS]

        select = ", ".join(f'"{f}"' for f in fields)
        cur.execute(f"SELECT {select} FROM counties")
        rows = cur.fetchall()

    # Normalize: convert NaN/None to null, round floats to 2 decimals where
    # they're known-derived (saves bytes; scoring doesn't need 6 decimal places).
    def normalize(value):
        if value is None:
            return None
        if isinstance(value, float):
            # JSON can't represent NaN; coerce to null
            if value != value:   # NaN check
                return None
            return round(value, 2)
        return value

    cleaned_rows = [[normalize(v) for v in row] for row in rows]

    payload = {
        "version": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "fields": fields,
        "rows": cleaned_rows,
    }

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with OUT_PATH.open("w", encoding="utf-8") as f:
        json.dump(payload, f, separators=(",", ":"))  # compact form

    size_kb = OUT_PATH.stat().st_size / 1024
    print(f"  wrote {OUT_PATH}  ({len(cleaned_rows)} rows × {len(fields)} fields)")
    print(f"  size: {size_kb:.0f} KB raw (~{size_kb * 0.18:.0f} KB after gzip)")


if __name__ == "__main__":
    run()
