#!/usr/bin/env python3
"""Validate the exact-coordinate overlay and report effective map coverage."""

from __future__ import annotations

import json
from datetime import date
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[1]


def load(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def require(condition: bool, message: str):
    if not condition:
        raise AssertionError(message)


def valid_url(value: str) -> bool:
    parsed = urlparse(value)
    return parsed.scheme in {"http", "https"} and bool(parsed.netloc)


def main():
    venue_files = [
        ROOT / "data" / "venues.json",
        ROOT / "data" / "venues-extra.json",
        ROOT / "data" / "venues-major.json",
    ]
    venues = [venue for path in venue_files for venue in load(path)]
    venue_ids = {venue["id"] for venue in venues}
    coordinates = load(ROOT / "data" / "venue-coordinates.json")

    seen = set()
    for record in coordinates:
        venue_id = record.get("venueId")
        require(venue_id in venue_ids, f"coordinate overlay references unknown venue: {venue_id}")
        require(venue_id not in seen, f"duplicate coordinate overlay: {venue_id}")
        seen.add(venue_id)
        lat, lng = record.get("lat"), record.get("lng")
        require(isinstance(lat, (int, float)) and -90 <= lat <= 90, f"{venue_id}: invalid latitude")
        require(isinstance(lng, (int, float)) and -180 <= lng <= 180, f"{venue_id}: invalid longitude")
        require(record.get("precision") in {"exact", "building"}, f"{venue_id}: invalid precision")
        require(str(record.get("method", "")).strip(), f"{venue_id}: missing coordinate method")
        require(str(record.get("sourceName", "")).strip(), f"{venue_id}: missing coordinate source name")
        require(valid_url(record.get("sourceUrl", "")), f"{venue_id}: invalid coordinate source URL")
        date.fromisoformat(record.get("lastVerified", ""))

    effective = set(record["venueId"] for record in coordinates)
    effective.update(venue["id"] for venue in venues if venue.get("lat") is not None and venue.get("lng") is not None)
    print(f"validated {len(coordinates)} coordinate overlays; effective exact/building coverage {len(effective)}/{len(venues)} venues")


if __name__ == "__main__":
    main()
