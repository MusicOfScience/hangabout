#!/usr/bin/env python3
"""Resolve source observations against Hangabout venues without publishing them.

This is deliberately a review tool. It emits candidate venue matches and explicit
classification hints, but never mutates canonical venue/exhibition/event data.
"""

from __future__ import annotations

import argparse
import json
import re
import unicodedata
from difflib import SequenceMatcher
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"


TYPE_PATTERNS: list[tuple[str, re.Pattern[str]]] = [
    ("artist-talk", re.compile(r"\b(?:artist|artists|floor)\s+(?:talk|conversation)|\bin conversation\b", re.I)),
    ("tour", re.compile(r"\b(?:tour|guided tour|audio described|tactile tour|auslan tour|language tour)\b", re.I)),
    ("screening", re.compile(r"\b(?:screening|film screening)\b", re.I)),
    ("workshop", re.compile(r"\bworkshop\b", re.I)),
    ("poetry", re.compile(r"\b(?:poetry|reading|listening circle)\b", re.I)),
    ("performance", re.compile(r"\bperformance\b", re.I)),
    ("auction", re.compile(r"\bauction\b", re.I)),
    ("launch", re.compile(r"\blaunch\b", re.I)),
    ("closing", re.compile(r"\b(?:closing|finissage)\b", re.I)),
    ("activation", re.compile(r"\bactivation\b", re.I)),
    ("market", re.compile(r"\bmarket\b", re.I)),
    ("opening", re.compile(r"\bopening\b", re.I)),
]


def norm(value: str | None) -> str:
    if not value:
        return ""
    value = unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode("ascii")
    value = value.lower().replace("&", " and ")
    return " ".join(re.findall(r"[a-z0-9]+", value))


def title_venue_prefix(title: str) -> str:
    for separator in (" - ", " – ", " — ", ": "):
        if separator in title:
            return title.split(separator, 1)[0].strip()
    return ""


def similarity(a: str, b: str) -> float:
    a_n, b_n = norm(a), norm(b)
    if not a_n or not b_n:
        return 0.0
    if a_n == b_n:
        return 1.0
    if a_n in b_n or b_n in a_n:
        shorter = min(len(a_n), len(b_n))
        longer = max(len(a_n), len(b_n))
        return 0.82 + 0.18 * (shorter / longer)
    return SequenceMatcher(None, a_n, b_n).ratio()


def venue_score(observation: dict, venue: dict) -> tuple[float, dict[str, float]]:
    prefix = title_venue_prefix(str(observation.get("titleRaw", "")))
    title_score = similarity(prefix, str(venue.get("name", ""))) if prefix else 0.0
    location = str(observation.get("locationRaw", ""))
    address_score = similarity(location, str(venue.get("address", "")))
    suburb_score = similarity(location, str(venue.get("suburb", "")))

    # Name is strong evidence; a near-exact address can independently rescue aliases.
    score = max(title_score * 0.72 + address_score * 0.28, address_score * 0.88 + title_score * 0.12)
    if address_score < 0.35 and suburb_score > 0.8:
        score += 0.03
    return min(score, 1.0), {
        "titleName": round(title_score, 3),
        "locationAddress": round(address_score, 3),
        "locationSuburb": round(suburb_score, 3),
    }


def classification_hint(title: str) -> str | None:
    for event_type, pattern in TYPE_PATTERNS:
        if pattern.search(title):
            return event_type
    return None


def registration_hint(title: str) -> dict | None:
    if re.search(r"\bRSVP\s+essential\b", title, re.I):
        return {"required": True, "status": "unknown", "evidence": "title says RSVP essential"}
    if re.search(r"\bfully booked\b", title, re.I):
        return {"required": True, "status": "fully-booked", "evidence": "title says fully booked"}
    return None


def resolve_observations(observations: list[dict], venues: list[dict]) -> dict:
    results = []
    for observation in observations:
        candidates = []
        for venue in venues:
            score, evidence = venue_score(observation, venue)
            if score >= 0.42:
                candidates.append({
                    "venueId": venue["id"],
                    "venueName": venue["name"],
                    "score": round(score, 3),
                    "evidence": evidence,
                })
        candidates.sort(key=lambda item: (-item["score"], item["venueName"]))
        top = candidates[:3]
        best = top[0] if top else None
        second = top[1] if len(top) > 1 else None
        margin = (best["score"] - second["score"]) if best and second else (best["score"] if best else 0.0)

        if best and best["score"] >= 0.82 and margin >= 0.08:
            resolution = "matched"
        elif best and best["score"] >= 0.64:
            resolution = "review"
        else:
            resolution = "unresolved"

        title = str(observation.get("titleRaw", ""))
        results.append({
            "observationId": observation.get("id"),
            "titleRaw": title,
            "locationRaw": observation.get("locationRaw"),
            "resolution": resolution,
            "selectedVenueId": best["venueId"] if resolution == "matched" and best else None,
            "candidates": top,
            "eventTypeHint": classification_hint(title),
            "registrationHint": registration_hint(title),
        })

    return {
        "summary": {
            "total": len(results),
            "matched": sum(item["resolution"] == "matched" for item in results),
            "review": sum(item["resolution"] == "review" for item in results),
            "unresolved": sum(item["resolution"] == "unresolved" for item in results),
        },
        "results": results,
    }


def load_venues() -> list[dict]:
    by_id: dict[str, dict] = {}
    for name in ("venues.json", "venues-extra.json", "venues-major.json"):
        for venue in json.loads((DATA / name).read_text(encoding="utf-8")):
            by_id[venue["id"]] = venue
    return list(by_id.values())


def main() -> int:
    parser = argparse.ArgumentParser(description="Resolve Hangabout programme observations for human review.")
    parser.add_argument("input", type=Path, help="JSON array of SourceObservation records")
    parser.add_argument("--output", type=Path, help="Write review report here instead of stdout")
    args = parser.parse_args()

    observations = json.loads(args.input.read_text(encoding="utf-8"))
    if not isinstance(observations, list):
        raise SystemExit("input must be a JSON array")
    report = resolve_observations(observations, load_venues())
    text = json.dumps(report, indent=2, ensure_ascii=False) + "\n"
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(text, encoding="utf-8")
    else:
        print(text, end="")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
