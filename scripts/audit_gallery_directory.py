#!/usr/bin/env python3
"""Compare scheduled discovery results with the published gallery directory."""

import argparse
import json
import os
from collections import Counter
from datetime import date, datetime
from pathlib import Path
from urllib.parse import urlsplit
from zoneinfo import ZoneInfo

from audit_programme_coverage import DATA, load, merged_venues
from reverify_programme import normalise_text
from validate_freshness import VENUE_MAX_AGE_DAYS, check


def website_key(url: str) -> tuple[str, str] | None:
    try:
        parsed = urlsplit(url)
        if parsed.scheme not in {"http", "https"} or not parsed.hostname:
            return None
        return parsed.netloc.lower().removeprefix("www."), parsed.path.rstrip("/")
    except ValueError:
        return None


def compare(candidates: list[dict], venues: dict[str, dict], known_places: list[dict]) -> list[dict]:
    by_qid = {venue["wikidataId"]: venue_id for venue_id, venue in venues.items() if venue.get("wikidataId")}
    results = []
    for candidate in candidates:
        label = normalise_text(candidate["name"])
        websites = {key for url in candidate["websiteCandidates"] if (key := website_key(url))}
        website_matches = sorted(venue_id for venue_id, venue in venues.items()
                                 if website_key(venue["website"]) in websites)
        name_matches = sorted(venue_id for venue_id, venue in venues.items()
                              if label and normalise_text(venue["name"]) == label)
        directory_matches = sorted(set(website_matches) | set(name_matches))
        cache_matches = sorted(place["id"] for place in known_places
                               if label and normalise_text(place["name"]) == label and place["id"] not in venues)
        reviewed_id = by_qid.get(candidate["id"])
        if reviewed_id:
            status = "reviewed"
        elif len(directory_matches) > 1:
            status = "ambiguous"
        elif directory_matches:
            status = "possible-directory-match"
        elif cache_matches:
            status = "possible-cache-match"
        else:
            status = "unmatched"

        results.append({
            **candidate,
            "matchedVenueId": reviewed_id,
            "status": status,
            "directoryWebsiteMatches": website_matches,
            "directoryNameMatches": name_matches,
            "discoveryCacheNameMatches": cache_matches,
            "websiteNeedsReview": bool(reviewed_id and websites and reviewed_id not in website_matches),
        })
    return results


def build_report(venues: dict[str, dict], known_places: list[dict], wikidata: dict | None,
                 discovery: dict | None, as_of: date) -> dict:
    overdue = []
    check(list(venues.values()), "venue", VENUE_MAX_AGE_DAYS, as_of, queue=overdue)
    candidates = compare(wikidata["candidates"], venues, known_places) if wikidata else []
    programme_issues = [
        source for source in (discovery or {}).get("sources", [])
        if source["status"] != "ok" or source["count"] == 0
    ]
    return {
        "asOf": as_of.isoformat(),
        "canonicalVenueCount": len(venues),
        "wikidata": {
            "status": "available" if wikidata else "unavailable",
            "observedAt": (wikidata or {}).get("observedAt"),
            "truncated": (wikidata or {}).get("truncated"),
            "counts": dict(Counter(row["status"] for row in candidates)),
            "candidates": candidates,
        },
        "programmeDiscovery": {
            "status": "available" if discovery else "unavailable",
            "observedAt": (discovery or {}).get("generatedAt"),
            "issues": programme_issues,
        },
        "overdueVenues": sorted(overdue, key=lambda row: (-row["ageDays"], row["id"])),
    }


def summary(report: dict) -> str:
    wikidata = report["wikidata"]
    counts = wikidata["counts"]
    discovery = report["programmeDiscovery"]
    lines = [
        "## Gallery directory review",
        "",
        f"- {report['canonicalVenueCount']} directory venues, "
        f"{len(report['overdueVenues'])} overdue for source review.",
    ]
    if wikidata["status"] == "available":
        lines.append(f"- Wikidata returned {sum(counts.values())} candidates. "
                     f"{counts.get('unmatched', 0)} have no directory or cache match. "
                     f"{counts.get('reviewed', 0)} have a reviewed Wikidata ID.")
        lines.append(f"- Possible matches for {counts.get('possible-directory-match', 0)} candidates in the directory "
                     f"and {counts.get('possible-cache-match', 0)} in the discovery cache. "
                     f"Review ambiguity for {counts.get('ambiguous', 0)} candidates and website discrepancies for "
                     f"{sum(row['websiteNeedsReview'] for row in wikidata['candidates'])} reviewed IDs.")
        if wikidata["truncated"]:
            lines.append("- Wikidata hit its query limit. The candidate counts cover the returned rows.")
    else:
        lines.append("- Wikidata results were unavailable. Check the candidate discovery step.")

    if discovery["status"] == "available":
        lines.append(f"- {len(discovery['issues'])} automated programme indexes reported an issue or zero links.")
    else:
        lines.append("- Programme discovery results were unavailable. Check the first-party discovery step.")

    lines += ["", "Download the **gallery-directory-review** artifact for record IDs, source links and match details."]
    return "\n".join(lines) + "\n"


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--wikidata", type=Path, required=True)
    parser.add_argument("--discovery", type=Path, required=True)
    parser.add_argument("--report", type=Path, required=True)
    parser.add_argument("--as-of", type=date.fromisoformat, default=datetime.now(ZoneInfo("Australia/Melbourne")).date())
    args = parser.parse_args()
    report = build_report(
        merged_venues(), load(DATA / "known-art-places.json"),
        load(args.wikidata) if args.wikidata.is_file() else None,
        load(args.discovery) if args.discovery.is_file() else None,
        args.as_of,
    )
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    output = summary(report)
    print(output, end="")
    if summary_path := os.environ.get("GITHUB_STEP_SUMMARY"):
        with Path(summary_path).open("a", encoding="utf-8") as handle:
            handle.write(output)


if __name__ == "__main__":
    main()
