#!/usr/bin/env python3
"""Audit whether Hangabout's gallery catalogue is actually monitored.

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
from datetime import date, datetime
from zoneinfo import ZoneInfo

from validate_freshness import end_boundary

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
SOURCES = ROOT / "sources"
VENUE_FILES = ("venues.json", "venues-extra.json", "venues-major.json", "venues-current.json")
EVENT_FILES = ("events.json", "events-extra.json", "events-major.json", "events-current.json", "events-current-coverage.json")


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


def exhibitions_from_catalogue() -> list[dict]:
    records: list[dict] = []
    for name in EVENT_FILES:
        path = DATA / name
        if path.exists():
            records.extend(load(path))
    return records


def norm(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", value.lower()).strip()


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--report", type=Path)
    parser.add_argument("--strict", action="store_true", help="fail when a maintained-programme venue has no monitored first-party index")
    parser.add_argument("--as-of", type=date.fromisoformat, default=datetime.now(ZoneInfo("Australia/Melbourne")).date())
    args = parser.parse_args()

    venues = merged_venues()
    indexes = load(SOURCES / "official-indexes.json")
    exhibitions = exhibitions_from_catalogue()
    known_places = load(DATA / "known-art-places.json")

    monitored = {item["venueId"] for item in indexes if item.get("automationAllowed") is True}
    live_programme = {item["venueId"] for item in exhibitions
                      if item["sourceType"] == "official" and end_boundary(item["endDate"]) >= args.as_of.isoformat()
                      and 0 <= (args.as_of - date.fromisoformat(item["lastVerified"])).days <= 14}
    programme_pages = monitored | {key for key, venue in venues.items() if venue.get("programmeUrl")}
    areas = {
        "Regional VIC": {key for key, venue in venues.items() if venue.get("region") == "Regional VIC"},
        "Regional NSW": {key for key, venue in venues.items() if venue.get("region") == "Regional NSW"},
        "Melbourne commercial and artist-run": {key for key, venue in venues.items()
            if venue.get("region", "Melbourne") == "Melbourne" and venue["kind"] in {"commercial", "artist-run"}},
    }
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
        "asOf": args.as_of.isoformat(),
        "coverageByArea": {area: {"identified": len(ids), "officialProgrammePages": len(ids & programme_pages),
                                  "withRecentlyVerifiedShow": len(ids & live_programme)}
                           for area, ids in areas.items()},
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
