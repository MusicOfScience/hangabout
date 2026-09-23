#!/usr/bin/env python3
"""Audit live-facing freshness and optionally fail a deliberate strict check."""

import argparse
import json
from datetime import date, datetime
from pathlib import Path
from zoneinfo import ZoneInfo


ROOT = Path(__file__).resolve().parents[1]


def load(name: str) -> list[dict]:
    path = ROOT / "data" / name
    return json.loads(path.read_text()) if path.exists() else []


def check(records: list[dict], label: str, maximum_days: int, today: date, *, active_only: bool = False, queue: list[dict] | None = None) -> list[str]:
    stale: list[str] = []
    checked = 0
    for record in records:
        if active_only and record.get("endDate", "") < today.isoformat():
            continue
        checked += 1
        verified = date.fromisoformat(record["lastVerified"])
        age = (today - verified).days
        if age > maximum_days:
            if queue is not None:
                queue.append({
                    "id": record.get("id"),
                    "kind": label,
                    "name": record.get("title") or record.get("name"),
                    "sourceUrl": record.get("sourceUrl") or record.get("website"),
                    "sourceType": record.get("sourceType"),
                    "lastVerified": record["lastVerified"],
                    "ageDays": age,
                    "maximumDays": maximum_days,
                })
            stale.append(f"{label} {record.get('id', '<unknown>')}: checked {age} days ago (maximum {maximum_days})")
    print(f"freshness: {checked} {label} records checked; maximum age {maximum_days} days")
    return stale


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--report", type=Path, help="write a source-linked JSON recheck queue")
    parser.add_argument("--strict", action="store_true", help="fail when any record exceeds its review age")
    args = parser.parse_args()
    queue: list[dict] = []
    today = datetime.now(ZoneInfo("Australia/Melbourne")).date()
    events = [*load("events.json"), *load("events-extra.json"), *load("events-major.json")]
    venues = [*load("venues.json"), *load("venues-extra.json"), *load("venues-major.json")]
    resources = [*load("make-resources.json"), *load("make-resources-extra.json")]

    volatile = [row for row in resources if row.get("resourceType") in {"studio", "opportunity"}]
    slower = [row for row in resources if row.get("resourceType") in {"workspace", "finder"}]

    stale = [
        *check(events, "current/upcoming event", 14, today, active_only=True, queue=queue),
        *check(volatile, "studio/opportunity", 14, today, queue=queue),
        *check(slower, "workspace/finder", 60, today, queue=queue),
        *check(venues, "venue", 90, today, queue=queue),
    ]

    if args.report:
        args.report.parent.mkdir(parents=True, exist_ok=True)
        args.report.write_text(json.dumps({
            "asOf": today.isoformat(),
            "purpose": "records needing source verification; not newly verified data",
            "records": queue,
        }, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    if stale:
        message = "freshness warning: records need source verification:\n" + "\n".join(f"- {item}" for item in stale)
        if args.strict:
            raise SystemExit(message)
        print(message)


if __name__ == "__main__":
    main()
