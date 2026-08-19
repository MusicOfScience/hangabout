#!/usr/bin/env python3
"""Validate hangabout's v3 layered data contract before deploy."""

from __future__ import annotations

from pathlib import Path
import validate_data_v2 as base

ROOT = Path(__file__).resolve().parents[1]
base.KINDS.add("major-institution")
base.RESOURCE_TYPES.add("opportunity")


def load_optional(name: str):
    path = ROOT / "data" / name
    return base.load(path) if path.exists() else []


def main():
    venues = [
        *base.load(ROOT / "data" / "venues.json"),
        *load_optional("venues-extra.json"),
        *load_optional("venues-major.json"),
    ]
    events = [
        *base.load(ROOT / "data" / "events.json"),
        *load_optional("events-extra.json"),
        *load_optional("events-major.json"),
    ]
    resources = [
        *load_optional("make-resources.json"),
        *load_optional("make-resources-extra.json"),
    ]

    venue_ids = [v.get("id") for v in venues]
    event_ids = [e.get("id") for e in events]
    resource_ids = [r.get("id") for r in resources]

    base.require(len(venue_ids) == len(set(venue_ids)), "duplicate venue id across data layers")
    base.require(len(event_ids) == len(set(event_ids)), "duplicate event id across data layers")
    base.require(len(resource_ids) == len(set(resource_ids)), "duplicate make-resource id across data layers")

    for venue in venues:
        base.validate_venue(venue)
    known_venues = set(venue_ids)
    for event in events:
        base.validate_event(event, known_venues)
    for resource in resources:
        base.validate_resource(resource)

    official = sum(event["sourceType"] == "official" for event in events)
    directory = len(events) - official
    exact = sum("lat" in venue for venue in venues)
    opportunities = sum(resource["resourceType"] == "opportunity" for resource in resources)
    print(
        f"validated {len(venues)} venues ({exact} exact pins), "
        f"{len(events)} events ({official} official, {directory} directory), "
        f"{len(resources)} make-art resources ({opportunities} opportunities)"
    )


if __name__ == "__main__":
    main()
