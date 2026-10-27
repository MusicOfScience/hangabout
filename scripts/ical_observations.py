#!/usr/bin/env python3
"""Parse iCalendar VEVENT records into reviewable Hangabout source observations.

This module deliberately stops before venue matching, event classification or
canonical publication. It preserves the source's own UID and raw date/time and
location values so later normalisation can be corrected without re-fetching or
inventing facts.
"""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
from typing import Iterable


def unfold_lines(text: str) -> list[str]:
    """Apply RFC 5545 line unfolding without interpreting property values."""
    lines = text.replace("\r\n", "\n").replace("\r", "\n").split("\n")
    unfolded: list[str] = []
    for line in lines:
        if line.startswith((" ", "\t")) and unfolded:
            unfolded[-1] += line[1:]
        else:
            unfolded.append(line)
    return unfolded


def unescape_text(value: str) -> str:
    """Unescape the common iCalendar TEXT escapes used in summaries/locations."""
    return (
        value.replace("\\N", "\n")
        .replace("\\n", "\n")
        .replace("\\,", ",")
        .replace("\\;", ";")
        .replace("\\\\", "\\")
    )


def split_property(line: str) -> tuple[str, str, str] | None:
    if ":" not in line:
        return None
    head, value = line.split(":", 1)
    name = head.split(";", 1)[0].upper()
    return name, head, value


def event_blocks(lines: Iterable[str]) -> list[list[str]]:
    blocks: list[list[str]] = []
    current: list[str] | None = None
    for line in lines:
        if line == "BEGIN:VEVENT":
            current = []
            continue
        if line == "END:VEVENT":
            if current is not None:
                blocks.append(current)
            current = None
            continue
        if current is not None:
            current.append(line)
    return blocks


def stable_observation_id(source_id: str, external_id: str, raw_block: str) -> str:
    identity = external_id or hashlib.sha256(raw_block.encode("utf-8")).hexdigest()
    digest = hashlib.sha256(f"{source_id}\0{identity}".encode("utf-8")).hexdigest()[:20]
    return f"ical-{digest}"


def parse_ical(text: str, *, source_id: str, observed_at: str) -> list[dict[str, str]]:
    observations: list[dict[str, str]] = []
    for block in event_blocks(unfold_lines(text)):
        props: dict[str, tuple[str, str]] = {}
        for line in block:
            parsed = split_property(line)
            if not parsed:
                continue
            name, head, value = parsed
            # Preserve the first value for canonical single-value properties.
            props.setdefault(name, (head, value))

        def value(name: str) -> str:
            return props.get(name, ("", ""))[1]

        def raw(name: str) -> str:
            head, property_value = props.get(name, ("", ""))
            return f"{head}:{property_value}" if head else ""

        title_raw = unescape_text(value("SUMMARY")).strip()
        if not title_raw:
            # An observation without a title is not useful for human review, but the
            # parser must not guess one from another property.
            continue

        raw_block = "\n".join(block)
        external_id = value("UID").strip()
        observation: dict[str, str] = {
            "id": stable_observation_id(source_id, external_id, raw_block),
            "sourceId": source_id,
            "observedAt": observed_at,
            "titleRaw": title_raw,
            "status": "observed",
            "payloadHash": hashlib.sha256(raw_block.encode("utf-8")).hexdigest(),
        }
        if external_id:
            observation["externalId"] = external_id
        if raw("DTSTART"):
            observation["startRaw"] = raw("DTSTART")
        if raw("DTEND"):
            observation["endRaw"] = raw("DTEND")
        if value("LOCATION"):
            observation["locationRaw"] = unescape_text(value("LOCATION")).strip()
        if value("URL"):
            observation["urlRaw"] = value("URL").strip()
        if value("STATUS"):
            observation["calendarStatusRaw"] = value("STATUS").strip()
        observations.append(observation)

    return observations


def main() -> int:
    parser = argparse.ArgumentParser(description="Convert an iCalendar file to Hangabout source observations.")
    parser.add_argument("input", type=Path, help="Local .ics file")
    parser.add_argument("--source-id", required=True, help="Stable Hangabout source identifier")
    parser.add_argument("--observed-at", required=True, help="ISO-8601 timestamp for this observation run")
    parser.add_argument("--output", type=Path, help="Write JSON here instead of stdout")
    args = parser.parse_args()

    observations = parse_ical(
        args.input.read_text(encoding="utf-8"),
        source_id=args.source_id,
        observed_at=args.observed_at,
    )
    payload = json.dumps(observations, indent=2, ensure_ascii=False) + "\n"
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(payload, encoding="utf-8")
    else:
        print(payload, end="")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
