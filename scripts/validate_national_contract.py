#!/usr/bin/env python3
"""Validate national geography/timezone contracts and offline fixture records."""
from __future__ import annotations

import json
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[1]
ZONES = {"Australia/Sydney", "Australia/Melbourne", "Australia/Brisbane", "Australia/Adelaide", "Australia/Darwin", "Australia/Hobart", "Australia/Perth"}


def main() -> None:
    regions = json.loads((ROOT / "data/australian-regions.json").read_text())
    assert {row["stateCode"] for row in regions} == {"ACT", "NSW", "NT", "QLD", "SA", "TAS", "VIC", "WA"}
    assert all(set(row["timeZones"]).issubset(ZONES) for row in regions)
    venues = json.loads((ROOT / "tests/fixtures/national/venues.json").read_text())
    ids = [row["id"] for row in venues]
    assert len(ids) == len(set(ids))
    for venue in venues:
        assert venue["countryCode"] == "AU"
        assert venue["stateCode"] in {row["stateCode"] for row in regions}
        assert venue["timeZone"] in ZONES
        assert venue["coordinatePrecision"] in {"exact", "building", "locality"}
        assert -90 <= venue["lat"] <= 90 and -180 <= venue["lng"] <= 180
        assert urlparse(venue["sourceUrl"]).scheme in {"http", "https"}
    print(f"validated {len(regions)} Australian region timezone records and {len(venues)} national fixture venues")


if __name__ == "__main__":
    main()
