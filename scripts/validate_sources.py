#!/usr/bin/env python3
"""Validate hangabout source policy without making network requests."""

from __future__ import annotations

import json
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[1]


def load(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def require(condition: bool, message: str):
    if not condition:
        raise AssertionError(message)


def host(url: str) -> str:
    parsed = urlparse(url)
    require(parsed.scheme == "https" and bool(parsed.netloc), f"invalid https URL: {url}")
    return parsed.netloc.lower().removeprefix("www.")


def main():
    policy = load(ROOT / "sources" / "source-policy.json")
    indexes = load(ROOT / "sources" / "official-indexes.json")

    reference = policy.get("referenceSources", [])
    blocked_hosts = {
        host(source["url"])
        for source in reference
        if source.get("automationAllowed") is False
    }

    venue_files = [
        ROOT / "data" / "venues.json",
        ROOT / "data" / "venues-extra.json",
        ROOT / "data" / "venues-major.json",
    ]
    venue_ids = {
        venue["id"]
        for path in venue_files
        if path.exists()
        for venue in load(path)
    }

    seen = set()
    for source in indexes:
        venue_id = source.get("venueId")
        require(venue_id in venue_ids, f"official index references unknown venue: {venue_id}")
        require(venue_id not in seen, f"duplicate official index for {venue_id}")
        seen.add(venue_id)
        require(source.get("automationAllowed") is True, f"official index must explicitly allow automation: {venue_id}")
        source_host = host(source.get("indexUrl", ""))
        require(source_host not in blocked_hosts, f"blocked reference host placed in automated indexes: {source_host}")
        patterns = source.get("includePathPatterns", [])
        require(isinstance(patterns, list) and patterns, f"{venue_id}: includePathPatterns must be non-empty")
        require(all(isinstance(p, str) and p.startswith("/") for p in patterns), f"{venue_id}: bad path pattern")

    for source in reference:
        require(source.get("automationAllowed") is False, f"reference source must be automation-disabled: {source.get('id')}")
        require(str(source.get("reason", "")).strip(), f"reference source needs a reason: {source.get('id')}")

    print(f"validated {len(indexes)} automated first-party indexes; {len(reference)} reference-only sources blocked from automation")


if __name__ == "__main__":
    main()
