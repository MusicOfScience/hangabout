#!/usr/bin/env python3
"""Refresh date-range exhibitions from Heide's first-party programme index."""

from __future__ import annotations

import argparse
import json
import re
from collections import Counter
from datetime import date, datetime
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urljoin, urlsplit
from urllib.request import HTTPRedirectHandler, Request, build_opener

from reverify_programme import (
    MELBOURNE_TZ, ROOT, exhibition_end_boundary, needs_verification, normalise_text,
)

VENUE = "heide-museum-modern-art"
INDEX = "https://www.heide.com.au/exhibitions/"
SOURCE = "Heide Museum of Modern Art"
USER_AGENT = "hangabout-exhibition-feed/0.1 (+https://github.com/MusicOfScience/hangabout)"
TARGET = "events-current.json"
# Preserve the existing public ID for the active curated listing.
EXISTING_IDS = {8101: "heide-whisson-foubister-going-back-in-2026"}
ARCHIVE_FILES = ("events.json", "events-extra.json", "events-major.json", "events-current-coverage.json")


class ProgrammePayload(HTMLParser):
    def __init__(self):
        super().__init__()
        self.reading = False
        self.payloads = []

    def handle_starttag(self, tag, attrs):
        if tag == "script" and dict(attrs).get("id") == "__NEXT_DATA__":
            self.reading = True

    def handle_endtag(self, tag):
        if tag == "script":
            self.reading = False

    def handle_data(self, data):
        if self.reading:
            self.payloads.append(data)


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def checked_html() -> str:
    from urllib.robotparser import RobotFileParser

    policy = json.loads((ROOT / "sources" / "source-policy.json").read_text(encoding="utf-8"))
    if not any(source.get("id") == "heide-exhibitions"
               and source.get("host") == urlsplit(INDEX).hostname
               and source.get("automationAllowed") is True
               for source in policy["refreshSources"]):
        raise ValueError("source policy does not permit Heide refresh")

    opener = build_opener(NoRedirect())

    def fetch(url, maximum):
        request = Request(url, headers={"User-Agent": USER_AGENT})
        with opener.open(request, timeout=20) as response:
            body = response.read(maximum + 1)
            if len(body) > maximum:
                raise ValueError("response exceeds size limit")
            return body.decode(response.headers.get_content_charset() or "utf-8")

    robots = RobotFileParser()
    robots.parse(fetch(urljoin(INDEX, "/robots.txt"), 100_000).splitlines())
    if not robots.can_fetch(USER_AGENT, INDEX):
        raise ValueError("robots.txt disallows programme index")
    return fetch(INDEX, 2_000_000)


def local_date(value: str) -> date:
    timestamp = datetime.fromisoformat(value)
    if timestamp.utcoffset() is None:
        raise ValueError("date lacks an explicit timezone offset")
    return timestamp.astimezone(MELBOURNE_TZ).date()


def programme_tiles(html: str) -> list[dict]:
    parser = ProgrammePayload()
    parser.feed(html)
    payload, = parser.payloads
    tiles = json.loads(payload)["props"]["pageProps"]["postTileData"]
    current, upcoming = tiles["current"], tiles["upcoming"]
    if not isinstance(current, list) or not isinstance(upcoming, list):
        raise ValueError("unexpected programme collections")
    if not current and not upcoming:
        raise ValueError("programme index returned no current or upcoming tiles")
    return current + upcoming


def apply_feed(records: list[dict], archived: list[dict], html: str, checked: str) -> list[dict]:
    tiles = programme_tiles(html)
    today = date.fromisoformat(checked)
    by_id = {row["id"]: row for row in records}
    all_records = records + archived
    ids = Counter(tile["id"] for tile in tiles if isinstance(tile, dict) and type(tile.get("id")) is int)
    paths = Counter(tile["url"] for tile in tiles if isinstance(tile, dict) and isinstance(tile.get("url"), str))
    results = []
    seen = set()

    for tile in tiles:
        native_id = tile.get("id") if isinstance(tile, dict) else None
        result = {"nativeId": native_id}
        results.append(result)
        if type(native_id) is not int or native_id <= 0:
            result["status"] = "review-invalid-id"
            continue
        if ids[native_id] > 1:
            result["status"] = "review-duplicate-id"
            continue
        seen.add(native_id)
        record_id = EXISTING_IDS.get(native_id, f"heide-feed-{native_id}")
        existing = by_id.get(record_id)

        try:
            if tile["tp"] != "exhibition" or tile.get("ds"):
                raise ValueError("type or date override needs review")
            path = tile["url"]
            if not re.fullmatch(r"/exhibitions/[a-z0-9-]+/", path):
                raise ValueError("unexpected detail URL")
            if paths[path] > 1:
                raise ValueError("duplicate detail URL")
            title = " ".join(f"{tile['t1']} {tile['t2']}".split())
            if not isinstance(tile["t1"], str) or not isinstance(tile["t2"], str) or not title:
                raise ValueError("missing title")
            start, end = local_date(tile["st"]), local_date(tile["nd"])
            if start > end:
                raise ValueError("reversed exhibition dates")
        except (KeyError, TypeError, ValueError) as exc:
            result.update(status="review-invalid-tile", reason=str(exc))
            continue

        url = urljoin(INDEX, path)
        result.update(id=record_id, title=title, sourceUrl=url, startDate=str(start), endDate=str(end))
        aliases = {normalise_text(title), normalise_text(tile["t2"])} - {""}
        if existing and (existing["venueId"] != VENUE or existing["sourceType"] != "official"
                         or normalise_text(existing["title"]) not in aliases
                         or existing["sourceUrl"] not in {INDEX, url}):
            result["status"] = "review-identity-change"
            continue
        if not existing and any(
            row["id"] == record_id
            or (row["venueId"] == VENUE and (
                row["sourceUrl"].rstrip("/") == url.rstrip("/")
                or normalise_text(row["title"]) in aliases
            ))
            for row in all_records
        ):
            result["status"] = "review-existing-match"
            continue
        if not existing and end < today:
            result["status"] = "ended"
            continue

        dates = {"startDate": str(start), "endDate": str(end)}
        if existing:
            if existing.get("opening") and any(existing.get(key) != value for key, value in dates.items()):
                result["status"] = "review-linked-opening"
                continue
            changed = any(existing.get(key) != value for key, value in {**dates, "sourceUrl": url}.items())
            if changed or (end >= today and needs_verification(existing.get("lastVerified"), checked)):
                existing.update(dates, sourceUrl=url, lastVerified=checked)
                result["status"] = "updated"
            else:
                result["status"] = "ended" if end < today else "unchanged"
        else:
            records.append({
                "id": record_id, "venueId": VENUE, "title": title, "artists": [],
                **dates, "eventType": "exhibition", "admission": "unknown",
                "sourceName": SOURCE, "sourceType": "official", "sourceUrl": url,
                "lastVerified": checked,
            })
            result["status"] = "added"

    for row in records:
        if row["venueId"] != VENUE or exhibition_end_boundary(row["endDate"]) < today:
            continue
        native_id = next((key for key, value in EXISTING_IDS.items() if value == row["id"]), None)
        if row["id"].startswith("heide-feed-"):
            native_id = int(row["id"].removeprefix("heide-feed-"))
        if native_id is not None and native_id not in seen:
            results.append({"id": row["id"], "status": "review-missing-from-index", "sourceUrl": row["sourceUrl"]})
    return results


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--report", type=Path, default=ROOT / "generated/exhibition-feed.json")
    args = parser.parse_args()
    checked = datetime.now(MELBOURNE_TZ).date().isoformat()
    data = ROOT / "data"
    target = data / TARGET
    records = json.loads(target.read_text(encoding="utf-8"))
    archived = [row for name in ARCHIVE_FILES for row in json.loads((data / name).read_text(encoding="utf-8"))]
    try:
        results = apply_feed(records, archived, checked_html(), checked)
    except (OSError, KeyError, TypeError, ValueError) as exc:
        results = [{"status": "source-failed", "reason": str(exc)}]
    if args.apply and any(row["status"] in {"added", "updated"} for row in results):
        target.write_text(json.dumps(records, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps({
        "sourceUrl": INDEX, "checked": checked, "applied": args.apply, "results": results,
    }, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"Heide exhibition feed: {', '.join(sorted({row['status'] for row in results}))}")


if __name__ == "__main__":
    main()
