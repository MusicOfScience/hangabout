"""Offline replay for the national discovery pilot.

The replay deliberately separates a source check from publication. A failed or
blocked response produces a review item and preserves the previous record.
"""
from __future__ import annotations

import hashlib
import json
import re
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit


def canonical_url(value: str) -> str:
    parts = urlsplit(value.strip())
    path = parts.path.rstrip("/") or "/"
    return urlunsplit((parts.scheme.lower(), parts.netloc.lower(), path, parts.query, ""))


def stable_id(source: str, native_id: str | None, url: str) -> str:
    identity = native_id or canonical_url(url)
    digest = hashlib.sha1(identity.encode("utf-8")).hexdigest()[:12]
    return f"{source.lower().replace(' ', '-')}-{digest}"


def parse_json_payload(source: str, payload: dict) -> list[dict]:
    rows = payload.get("events") or payload.get("exhibitions") or payload.get("items") or []
    candidates: list[dict] = []
    for row in rows:
        title = str(row.get("title") or row.get("name") or "").strip()
        url = str(row.get("url") or row.get("sourceUrl") or "").strip()
        if not title or not url:
            continue
        candidates.append({
            "id": stable_id(source, row.get("id"), url),
            "title": title,
            "sourceUrl": canonical_url(url),
            "startDate": row.get("startDate"),
            "endDate": row.get("endDate"),
            "venueName": row.get("venueName"),
            "source": source,
        })
    return candidates


def parse_html_payload(source: str, payload: str, base_url: str) -> list[dict]:
    # The pilot adapter only accepts explicit data attributes from a first-party
    # fixture; ordinary links remain candidates for review instead of events.
    pattern = re.compile(
        r'<article[^>]*data-title="([^"]+)"[^>]*data-start="([^"]+)"[^>]*data-end="([^"]+)"[^>]*data-url="([^"]+)"',
        re.I,
    )
    return [
        {
            "id": stable_id(source, None, url),
            "title": title.strip(),
            "sourceUrl": canonical_url(url if "://" in url else f"{base_url.rstrip('/')}/{url.lstrip('/')}"),
            "startDate": start,
            "endDate": end,
            "venueName": None,
            "source": source,
        }
        for title, start, end, url in pattern.findall(payload)
    ]


def replay_fixture(path: Path) -> dict:
    fixture = json.loads(path.read_text(encoding="utf-8"))
    candidates: dict[str, dict] = {}
    checks: list[dict] = []
    for case in fixture.get("cases", []):
        source = str(case["source"])
        status = str(case.get("status", "ok"))
        if status in {"timeout", "rate-limited", "robots-denied", "not-found", "malformed", "empty", "not-modified"}:
            checks.append({"source": source, "status": status, "preserved": bool(case.get("previousRecord"))})
            continue
        payload = case.get("payload")
        if status == "redirect":
            payload = case.get("payload", {})
            status = "ok"
        if isinstance(payload, dict):
            rows = parse_json_payload(source, payload)
        elif isinstance(payload, str):
            rows = parse_html_payload(source, payload, case.get("url", "https://fixture.invalid"))
        else:
            rows = []
        for row in rows:
            candidates[row["id"]] = row
        checks.append({"source": source, "status": "ok", "candidateCount": len(rows), "preserved": False})
    return {
        "schemaVersion": 1,
        "mode": "offline-fixture-replay",
        "candidates": sorted(candidates.values(), key=lambda row: row["id"]),
        "checks": checks,
    }


def main() -> None:
    import argparse

    parser = argparse.ArgumentParser(description="Replay deterministic national discovery fixtures")
    parser.add_argument("--fixture", type=Path, default=Path("tests/fixtures/ingestion/responses.json"))
    parser.add_argument("--report", type=Path)
    args = parser.parse_args()
    report = replay_fixture(args.fixture)
    rendered = json.dumps(report, indent=2, sort_keys=True) + "\n"
    if args.report:
        args.report.parent.mkdir(parents=True, exist_ok=True)
        args.report.write_text(rendered, encoding="utf-8")
    print(f"replayed {len(report['checks'])} source checks and {len(report['candidates'])} deduplicated candidates")
    for check in report["checks"]:
        print(f"- {check['source']}: {check['status']}")


if __name__ == "__main__":
    main()
