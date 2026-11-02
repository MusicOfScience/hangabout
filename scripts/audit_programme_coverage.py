#!/usr/bin/env python3
"""Audit whether Hangabout's known Melbourne art universe is actually monitored.

This is a coverage diagnostic, not a publishing pipeline. It compares:
- canonical venue records;
- first-party programme indexes that Hangabout actively monitors;
- current/upcoming canonical exhibition records; and
- the broader known-art-place layer used for discovery.

Secondary/known-place data can identify coverage debt, but never becomes a
canonical exhibition without first-party verification.
"""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
SOURCES = ROOT / "sources"
VENUE_FILES = ("venues.json", "venues-extra.json", "venues-major.json", "venues-current.json")


def load(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def merged_venues() -> dict[str, dict]:
    result: dict[str, dict] = {}
    for name in VENUE_FILES:
        path = DATA / name
        if not path.exists():
            continue
        for venue in load(path):
            result[venue["id"]] = venue
    return result


def norm(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", value.lower()).strip()


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--report", type=Path)
    parser.add_argument("--strict", action="store_true", help="fail when a maintained-programme venue has no monitored first-party index")
    args = parser.parse_args()

    venues = merged_venues()
    indexes = load(SOURCES / "official-indexes.json")
    exhibitions = load(DATA / "events-current.json")
    known_places = load(DATA / "known-art-places.json")

    monitored = {item["venueId"] for item in indexes if item.get("automationAllowed") is True}
    live_programme = {item["venueId"] for item in exhibitions}
    maintained = {venue_id for venue_id, venue in venues.items() if venue.get("coverageStatus") == "maintained-programme"}

    canonical_names = {norm(venue.get("name", "")) for venue in venues.values()}
    known_candidates = [
        place for place in known_places
        if norm(place.get("name", "")) and norm(place.get("name", "")) not in canonical_names
    ]

    maintained_unmonitored = sorted(maintained - monitored)
    monitored_without_live_programme = sorted(monitored - live_programme)
    canonical_unmonitored = sorted(set(venues) - monitored)

    report = {
        "canonicalVenueCount": len(venues),
        "knownArtPlaceCount": len(known_places),
        "monitoredProgrammeVenueCount": len(monitored),
        "liveProgrammeVenueCount": len(live_programme),
        "maintainedProgrammeVenueCount": len(maintained),
        "maintainedButUnmonitored": maintained_unmonitored,
        "monitoredWithoutLiveProgramme": monitored_without_live_programme,
        "canonicalWithoutProgrammeMonitoring": canonical_unmonitored,
        "knownPlaceCandidatesNotCanonical": [
            {
                "id": place.get("id"),
                "name": place.get("name"),
                "locality": place.get("locality"),
                "sourceName": place.get("sourceName"),
                "sourceUrl": place.get("sourceUrl"),
            }
            for place in known_candidates
        ],
    }

    if args.report:
        args.report.parent.mkdir(parents=True, exist_ok=True)
        args.report.write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    print(
        "programme coverage: "
        f"{len(monitored)} monitored / {len(venues)} canonical venues; "
        f"{len(live_programme)} venues with current/upcoming exhibition records; "
        f"{len(known_candidates)} known-place candidates not yet canonical"
    )
    if maintained_unmonitored:
        print("maintained-programme venues missing first-party monitoring: " + ", ".join(maintained_unmonitored))
    if monitored_without_live_programme:
        print("monitored venues with no live programme record: " + ", ".join(monitored_without_live_programme))

    return 1 if args.strict and maintained_unmonitored else 0


if __name__ == "__main__":
    raise SystemExit(main())
