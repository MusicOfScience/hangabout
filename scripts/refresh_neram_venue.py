#!/usr/bin/env python3
"""Propose address and map pin changes from NERAM's official venue record."""

import argparse
import json
import math
import os
import re
from datetime import datetime
from pathlib import Path
from urllib.error import URLError
from urllib.parse import urljoin
from urllib.request import Request, build_opener
from urllib.robotparser import RobotFileParser
from zoneinfo import ZoneInfo

from refresh_exhibition_feed import NoRedirect
from refresh_sources import PageParser, ROOT

VENUE_ID = "new-england-regional-art-museum"
SOURCE = "https://www.neram.com.au/venue/neram/"
USER_AGENT = "Hangabout/1.0 (+https://github.com/MusicOfScience/hangabout)"
VENUES = ROOT / "data" / "venues-current.json"
COORDINATES = ROOT / "data" / "venue-coordinates.json"


def read_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, data) -> None:
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def checked_html() -> str:
    policy = read_json(ROOT / "sources" / "source-policy.json")
    if not any(row["venueId"] == VENUE_ID and row["url"] == SOURCE and row["automationAllowed"] is True
               for row in policy.get("venueRefreshSources", [])):
        raise ValueError("source policy does not permit the NERAM venue refresh")

    opener = build_opener(NoRedirect())

    def fetch(url: str, limit: int) -> str:
        with opener.open(Request(url, headers={"User-Agent": USER_AGENT}), timeout=20) as response:
            body = response.read(limit + 1)
            if len(body) > limit:
                raise ValueError("source response exceeded its size limit")
            return body.decode(response.headers.get_content_charset() or "utf-8")

    robots = RobotFileParser()
    robots.parse(fetch(urljoin(SOURCE, "/robots.txt"), 100_000).splitlines())
    if not robots.can_fetch(USER_AGENT, SOURCE):
        raise ValueError("robots.txt disallows the venue page")
    return fetch(SOURCE, 2_000_000)


def parse_venue(page: str) -> tuple[str, tuple[float, float]]:
    parser = PageParser()
    parser.feed(page)
    matches = [row for row in parser.json_ld if isinstance(row, dict)
               and row.get("@type") == "Place" and row.get("url") == SOURCE and row.get("name") == "NERAM"]
    if len(matches) != 1:
        raise ValueError("expected exactly one structured record identifying NERAM")
    place, = matches
    address = place.get("address")
    if not isinstance(address, dict) or address.get("@type") != "PostalAddress" or any(
        address.get(field) != expected for field, expected in (
            ("addressLocality", "Armidale"), ("addressRegion", "NSW"),
            ("postalCode", "2350"), ("addressCountry", "Australia"),
        )
    ):
        raise ValueError("structured address lacks the expected Armidale locality")
    street = address.get("streetAddress")
    if not isinstance(street, str) or not re.fullmatch(r"\d[\w .'/–-]{2,99}", street.strip()):
        raise ValueError("missing or invalid structured street address")
    street = " ".join(street.split())
    street = re.sub(r"\bSt\.?$", "Street", street, flags=re.IGNORECASE)

    geo = place.get("geo")
    if not isinstance(geo, dict) or geo.get("@type") != "GeoCoordinates":
        raise ValueError("missing structured map coordinates")
    lat, lng = geo.get("latitude"), geo.get("longitude")
    if type(lat) not in {int, float} or type(lng) not in {int, float} or not (
        -90 <= lat <= 90 and -180 <= lng <= 180
    ):
        raise ValueError("invalid structured map coordinates")
    return f"{street}, Armidale NSW 2350", (lat, lng)


def address_key(value: str) -> str:
    value = value.casefold().replace("–", "-").replace("—", "-")
    return " ".join(value.split())


def compare_venue(venue: dict, pin: dict, page: str, observed_on: str) -> dict:
    address, (lat, lng) = parse_venue(page)
    # A large movement needs investigation even when the locality text is unchanged.
    north = (lat - pin["lat"]) * 111.2
    east = (lng - pin["lng"]) * 111.2 * math.cos(math.radians(pin["lat"]))
    if math.hypot(north, east) > 10:
        raise ValueError("structured map pin is more than 10 km from the reviewed location")

    old_pin = [pin["lat"], pin["lng"]]
    new_pin = [lat, lng]
    changes = {}
    if address_key(address) != address_key(venue["address"]):
        changes["address"] = {"previous": venue["address"], "proposed": address}
        venue.update(address=address, addressSourceUrl=SOURCE, addressLastVerified=observed_on)
    if old_pin != new_pin:
        changes["coordinates"] = {"previous": old_pin, "proposed": new_pin}
        pin.update(lat=lat, lng=lng, precision="building", method="first-party venue JSON-LD GeoCoordinates",
                   sourceName=venue["name"], sourceUrl=SOURCE, lastVerified=observed_on)
    return changes


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true", help="write the proposed changes to the checkout")
    parser.add_argument("--report", type=Path, required=True)
    args = parser.parse_args()
    observed_on = datetime.now(ZoneInfo("Australia/Sydney")).date().isoformat()
    report = {"venueId": VENUE_ID, "sourceUrl": SOURCE, "attemptedOn": observed_on, "changes": {}}
    venues, pins = read_json(VENUES), read_json(COORDINATES)
    venue, = (row for row in venues if row["id"] == VENUE_ID)
    pin, = (row for row in pins if row["venueId"] == VENUE_ID)
    try:
        report["changes"] = compare_venue(venue, pin, checked_html(), observed_on)
        report["status"] = "change-proposed" if report["changes"] else "match"
    except (URLError, OSError, ValueError) as exc:
        report.update(status="check-failed", reason=f"{type(exc).__name__}: {exc}")
    args.report.parent.mkdir(parents=True, exist_ok=True)
    write_json(args.report, report)
    summary = {
        "match": "NERAM’s official address and map pin match the directory.",
        "change-proposed": "NERAM’s official venue data differs from the directory. See the review artifact.",
        "check-failed": "NERAM’s venue check failed. See the review artifact for the source response status.",
    }[report["status"]]
    print(summary)
    if summary_path := os.environ.get("GITHUB_STEP_SUMMARY"):
        with Path(summary_path).open("a", encoding="utf-8") as handle:
            handle.write(summary + "\n")
    if report["status"] == "check-failed":
        raise SystemExit(report["reason"])
    if args.apply:
        if "address" in report["changes"]:
            write_json(VENUES, venues)
        if "coordinates" in report["changes"]:
            write_json(COORDINATES, pins)


if __name__ == "__main__":
    main()
