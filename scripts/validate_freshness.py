#!/usr/bin/env python3
"""Block releases when live-facing records have gone materially stale."""

import json
from datetime import date, datetime
from pathlib import Path
from zoneinfo import ZoneInfo


ROOT = Path(__file__).resolve().parents[1]


def load(name: str) -> list[dict]:
    path = ROOT / "data" / name
    return json.loads(path.read_text()) if path.exists() else []


def check(records: list[dict], label: str, maximum_days: int, today: date, *, active_only: bool = False) -> list[str]:
    stale: list[str] = []
    checked = 0
    for record in records:
        if active_only and record.get("endDate", "") < today.isoformat():
            continue
        checked += 1
        verified = date.fromisoformat(record["lastVerified"])
        age = (today - verified).days
        if age > maximum_days:
            stale.append(f"{label} {record.get('id', '<unknown>')}: checked {age} days ago (maximum {maximum_days})")
    print(f"freshness: {checked} {label} records checked; maximum age {maximum_days} days")
    return stale


def main() -> None:
    today = datetime.now(ZoneInfo("Australia/Melbourne")).date()
    events = [*load("events.json"), *load("events-extra.json"), *load("events-major.json")]
    venues = [*load("venues.json"), *load("venues-extra.json"), *load("venues-major.json")]
    resources = [*load("make-resources.json"), *load("make-resources-extra.json")]

    volatile = [row for row in resources if row.get("resourceType") in {"studio", "opportunity"}]
    slower = [row for row in resources if row.get("resourceType") in {"workspace", "finder"}]

    stale = [
        *check(events, "current/upcoming event", 14, today, active_only=True),
        *check(volatile, "studio/opportunity", 14, today),
        *check(slower, "workspace/finder", 60, today),
        *check(venues, "venue", 90, today),
    ]

    if stale:
        raise SystemExit("release blocked by stale live-facing data:\n" + "\n".join(f"- {item}" for item in stale))


if __name__ == "__main__":
    main()
