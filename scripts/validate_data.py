#!/usr/bin/env python3
"""Validate hangabout's hand-curated data contract before it can deploy."""

from __future__ import annotations

import json
import re
from datetime import date
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[1]
VENUES_PATH = ROOT / "data" / "venues.json"
EVENTS_PATH = ROOT / "data" / "events.json"

KINDS = {
    "artist-run",
    "commercial",
    "contemporary-org",
    "first-nations-led",
    "independent",
    "municipal",
    "specialist",
    "university",
}
ADMISSION = {"free", "paid", "unknown"}
SOURCE_TYPES = {"official", "directory"}
ACCESS_LEVELS = {"full", "partial", "unknown"}
TIME_RE = re.compile(r"^(?:[01]\d|2[0-3]):[0-5]\d$")
ID_RE = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")


def load(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def require(condition: bool, message: str):
    if not condition:
        raise AssertionError(message)


def valid_url(value: str) -> bool:
    parsed = urlparse(value)
    return parsed.scheme in {"http", "https"} and bool(parsed.netloc)


def valid_date(value: str, context: str) -> date:
    try:
        return date.fromisoformat(value)
    except (TypeError, ValueError) as exc:
        raise AssertionError(f"{context}: invalid ISO date {value!r}") from exc


def validate_hours(venue: dict):
    hours = venue.get("hours", {})
    require(isinstance(hours, dict), f"{venue['id']}: hours must be an object")
    for weekday, span in hours.items():
        require(weekday in {str(n) for n in range(7)}, f"{venue['id']}: bad weekday {weekday}")
        require(isinstance(span, list) and len(span) == 2, f"{venue['id']}: bad hours for {weekday}")
        start, end = span
        require(all(isinstance(value, int) for value in span), f"{venue['id']}: hours must be minute integers")
        require(0 <= start < end <= 1440, f"{venue['id']}: invalid hours span {span}")
    if venue.get("hoursVerified"):
        require(bool(hours), f"{venue['id']}: verified hours cannot be empty")
        require(valid_url(venue.get("hoursSourceUrl", "")), f"{venue['id']}: verified hours need a first-party source URL")


def validate_venue(venue: dict):
    context = venue.get("id", "<venue>")
    require(ID_RE.fullmatch(context) is not None, f"{context}: invalid id")
    require(str(venue.get("name", "")).strip(), f"{context}: missing name")
    require(venue.get("kind") in KINDS, f"{context}: uncontrolled kind {venue.get('kind')!r}")
    require(str(venue.get("suburb", "")).strip(), f"{context}: missing suburb")
    require(str(venue.get("address", "")).strip(), f"{context}: missing address")
    require(valid_url(venue.get("website", "")), f"{context}: bad website")
    require(valid_url(venue.get("sourceUrl", "")), f"{context}: bad sourceUrl")
    valid_date(venue.get("lastVerified"), context)

    has_lat = "lat" in venue
    has_lng = "lng" in venue
    require(has_lat == has_lng, f"{context}: coordinates must be both present or both absent")
    if has_lat:
        require(isinstance(venue["lat"], (int, float)) and -90 <= venue["lat"] <= 90, f"{context}: bad latitude")
        require(isinstance(venue["lng"], (int, float)) and -180 <= venue["lng"] <= 180, f"{context}: bad longitude")

    focus = venue.get("focus", [])
    require(isinstance(focus, list) and all(isinstance(value, str) and value.strip() for value in focus), f"{context}: focus must be non-empty strings")
    pathways = venue.get("artistPathways", [])
    require(isinstance(pathways, list), f"{context}: artistPathways must be a list")
    for pathway in pathways:
        require(str(pathway.get("label", "")).strip(), f"{context}: pathway missing label")
        require(valid_url(pathway.get("url", "")), f"{context}: pathway has bad URL")

    access = venue.get("access")
    if access is not None:
        require(access.get("level") in ACCESS_LEVELS, f"{context}: bad access level")
        require(str(access.get("note", "")).strip(), f"{context}: access note missing")
        require(valid_url(access.get("sourceUrl", "")), f"{context}: access note needs source URL")

    validate_hours(venue)


def validate_event(event: dict, venue_ids: set[str]):
    context = event.get("id", "<event>")
    require(ID_RE.fullmatch(context) is not None, f"{context}: invalid id")
    require(event.get("venueId") in venue_ids, f"{context}: unknown venue {event.get('venueId')!r}")
    require(str(event.get("title", "")).strip(), f"{context}: missing title")
    artists = event.get("artists", [])
    require(isinstance(artists, list) and artists and all(isinstance(value, str) and value.strip() for value in artists), f"{context}: artists must be a non-empty list")
    require(str(event.get("eventType", "")).strip(), f"{context}: missing eventType")
    require(event.get("admission") in ADMISSION, f"{context}: bad admission")
    require(event.get("sourceType") in SOURCE_TYPES, f"{context}: bad sourceType")
    require(str(event.get("sourceName", "")).strip(), f"{context}: missing sourceName")
    require(valid_url(event.get("sourceUrl", "")), f"{context}: bad source URL")
    valid_date(event.get("lastVerified"), context)

    start = valid_date(event.get("startDate"), context)
    end = valid_date(event.get("endDate"), context)
    require(start <= end, f"{context}: startDate is after endDate")

    tags = event.get("tags", [])
    require(isinstance(tags, list) and all(isinstance(value, str) and value.strip() for value in tags), f"{context}: tags must be strings")

    opening = event.get("opening")
    if opening is not None:
        opening_date = valid_date(opening.get("date"), context)
        require(start.toordinal() - 14 <= opening_date.toordinal() <= end.toordinal(), f"{context}: implausible opening date")
        require(TIME_RE.fullmatch(opening.get("start", "")) is not None, f"{context}: bad opening start time")
        require(TIME_RE.fullmatch(opening.get("end", "")) is not None, f"{context}: bad opening end time")
        require(opening["start"] < opening["end"], f"{context}: opening start must precede end")


def main():
    venues = load(VENUES_PATH)
    events = load(EVENTS_PATH)
    require(isinstance(venues, list), "venues.json must contain a list")
    require(isinstance(events, list), "events.json must contain a list")

    venue_ids = [venue.get("id") for venue in venues]
    event_ids = [event.get("id") for event in events]
    require(len(venue_ids) == len(set(venue_ids)), "duplicate venue id")
    require(len(event_ids) == len(set(event_ids)), "duplicate event id")

    for venue in venues:
        validate_venue(venue)
    known_venues = set(venue_ids)
    for event in events:
        validate_event(event, known_venues)

    official = sum(event["sourceType"] == "official" for event in events)
    directory = len(events) - official
    mapped = sum("lat" in venue for venue in venues)
    print(f"validated {len(venues)} venues ({mapped} mapped) and {len(events)} events ({official} official, {directory} directory)")


if __name__ == "__main__":
    main()
