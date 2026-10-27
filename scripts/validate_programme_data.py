#!/usr/bin/env python3
"""Validate canonical Hangabout timed programme-event data."""

from __future__ import annotations

import json
import re
import sys
from datetime import date
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
TIME_RE = re.compile(r"^(?:[01]\d|2[0-3]):[0-5]\d$")
SOURCE_TYPES = {"official", "directory", "calendar"}


def read_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def merged_records(*names: str) -> list[dict]:
    by_id: dict[str, dict] = {}
    for name in names:
        path = DATA / name
        if not path.exists():
            continue
        for item in read_json(path):
            by_id[item["id"]] = item
    return list(by_id.values())


def valid_date(value: object) -> bool:
    if not isinstance(value, str) or not DATE_RE.match(value):
        return False
    try:
        date.fromisoformat(value)
    except ValueError:
        return False
    return True


def validate() -> list[str]:
    errors: list[str] = []
    venues = {item["id"]: item for item in merged_records("venues.json", "venues-extra.json", "venues-major.json", "venues-current.json")}
    exhibitions = {item["id"]: item for item in merged_records("events.json", "events-extra.json", "events-major.json", "events-current.json")}
    programme_events = read_json(DATA / "programme-events.json")

    if not isinstance(programme_events, list):
        return ["programme-events.json must contain a JSON array"]

    seen: set[str] = set()
    required = ("id", "venueId", "title", "eventType", "startDate", "sourceName", "sourceType", "sourceUrl", "lastVerified")

    for index, event in enumerate(programme_events):
        label = event.get("id") if isinstance(event, dict) else f"index {index}"
        if not isinstance(event, dict):
            errors.append(f"{label}: record must be an object")
            continue

        for field in required:
            if not isinstance(event.get(field), str) or not event[field].strip():
                errors.append(f"{label}: missing non-empty string {field}")

        event_id = event.get("id")
        if isinstance(event_id, str):
            if event_id in seen:
                errors.append(f"{label}: duplicate id")
            seen.add(event_id)

        venue_id = event.get("venueId")
        if isinstance(venue_id, str) and venue_id not in venues:
            errors.append(f"{label}: unknown venueId {venue_id}")

        exhibition_id = event.get("exhibitionId")
        if exhibition_id is not None:
            if not isinstance(exhibition_id, str) or exhibition_id not in exhibitions:
                errors.append(f"{label}: unknown exhibitionId {exhibition_id}")
            elif isinstance(venue_id, str) and exhibitions[exhibition_id].get("venueId") != venue_id:
                errors.append(f"{label}: exhibitionId belongs to a different venue")

        start_date = event.get("startDate")
        end_date = event.get("endDate")
        if not valid_date(start_date):
            errors.append(f"{label}: startDate must be a real YYYY-MM-DD date")
        if end_date is not None and not valid_date(end_date):
            errors.append(f"{label}: endDate must be a real YYYY-MM-DD date")
        if valid_date(start_date) and end_date is not None and valid_date(end_date):
            if date.fromisoformat(end_date) < date.fromisoformat(start_date):
                errors.append(f"{label}: endDate precedes startDate")

        for field in ("startTime", "endTime"):
            value = event.get(field)
            if value is not None and (not isinstance(value, str) or not TIME_RE.match(value)):
                errors.append(f"{label}: {field} must be HH:MM in 24-hour local time")

        people = event.get("people")
        if people is not None:
            if not isinstance(people, list):
                errors.append(f"{label}: people must be an array")
            else:
                for person_index, person in enumerate(people):
                    if not isinstance(person, dict):
                        errors.append(f"{label}: people[{person_index}] must be an object")
                        continue
                    if not isinstance(person.get("name"), str) or not person["name"].strip():
                        errors.append(f"{label}: people[{person_index}].name must be a non-empty string")
                    if not isinstance(person.get("role"), str) or not person["role"].strip():
                        errors.append(f"{label}: people[{person_index}].role must be a non-empty string")

        registration = event.get("registration")
        if registration is not None:
            if not isinstance(registration, dict):
                errors.append(f"{label}: registration must be an object")
            else:
                if "required" in registration and not isinstance(registration["required"], bool):
                    errors.append(f"{label}: registration.required must be boolean")
                for field in ("url", "status", "capacityNote"):
                    if field in registration and (not isinstance(registration[field], str) or not registration[field].strip()):
                        errors.append(f"{label}: registration.{field} must be a non-empty string")

        for field in ("price", "audienceNote", "materialsNote", "locationNote"):
            if field in event and (not isinstance(event[field], str) or not event[field].strip()):
                errors.append(f"{label}: {field} must be a non-empty string")

        source_type = event.get("sourceType")
        if isinstance(source_type, str) and source_type not in SOURCE_TYPES:
            errors.append(f"{label}: unsupported sourceType {source_type}")

        if not valid_date(event.get("lastVerified")):
            errors.append(f"{label}: lastVerified must be a real YYYY-MM-DD date")

    return errors


def main() -> int:
    errors = validate()
    if errors:
        print("Programme data validation failed:", file=sys.stderr)
        for error in errors:
            print(f"- {error}", file=sys.stderr)
        return 1
    count = len(read_json(DATA / "programme-events.json"))
    print(f"Programme data validation passed: {count} timed events")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
