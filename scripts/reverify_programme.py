#!/usr/bin/env python3
"""Re-verify canonical current/upcoming exhibitions against first-party sources.

This is deliberately conservative. It does not discover or rewrite exhibition
facts. It revisits only source URLs already curated into ``events-current.json``
and advances ``lastVerified`` only when the source is first-party, fetchable,
robots permits access, and the exhibition title is still present in the page
text. Failed or ambiguous checks preserve the last-good record unchanged.
"""

from __future__ import annotations

import argparse
import html
import json
import re
import time
import unicodedata
from datetime import date, datetime
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlparse
from urllib.request import Request, urlopen
from urllib.robotparser import RobotFileParser
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parents[1]
MELBOURNE_TZ = ZoneInfo("Australia/Melbourne")
USER_AGENT = "hangabout-programme-reverify/0.1 (+https://github.com/MusicOfScience/hangabout)"
TIMEOUT = 20
CHECK_RECORD_INTERVAL_DAYS = 7


class TextParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.text: list[str] = []
        self._ignored_depth = 0

    def handle_starttag(self, tag: str, attrs):
        if tag.lower() in {"script", "style", "noscript"}:
            self._ignored_depth += 1

    def handle_endtag(self, tag: str):
        if tag.lower() in {"script", "style", "noscript"} and self._ignored_depth:
            self._ignored_depth -= 1

    def handle_data(self, data: str):
        if not self._ignored_depth:
            self.text.append(data)


def normalise_text(value: str) -> str:
    value = html.unescape(value)
    value = unicodedata.normalize("NFKD", value)
    value = "".join(ch for ch in value if not unicodedata.combining(ch))
    value = value.casefold().replace("&", " and ")
    return re.sub(r"[^a-z0-9]+", " ", value).strip()


def page_contains_title(page_text: str, title: str) -> bool:
    wanted = normalise_text(title)
    haystack = normalise_text(page_text)
    return bool(wanted) and wanted in haystack


def source_host(url: str) -> str:
    return urlparse(url).netloc.lower().removeprefix("www.")


def load_blocked_reference_hosts() -> set[str]:
    policy = json.loads((ROOT / "sources" / "source-policy.json").read_text(encoding="utf-8"))
    return {
        source_host(str(source.get("url", "")))
        for source in policy.get("referenceSources", [])
        if source.get("automationAllowed") is False and source.get("url")
    }


def robots_allows(url: str) -> tuple[bool, str]:
    parsed = urlparse(url)
    robots_url = f"{parsed.scheme}://{parsed.netloc}/robots.txt"
    parser = RobotFileParser()
    parser.set_url(robots_url)
    try:
        parser.read()
    except Exception as exc:  # pragma: no cover - live network evidence
        return False, f"robots unavailable: {type(exc).__name__}"
    return parser.can_fetch(USER_AGENT, url), robots_url


def fetch_page_text(url: str) -> str:
    request = Request(url, headers={"User-Agent": USER_AGENT, "Accept": "text/html,application/xhtml+xml"})
    with urlopen(request, timeout=TIMEOUT) as response:
        content_type = response.headers.get("Content-Type", "")
        if "html" not in content_type.lower():
            raise RuntimeError(f"unexpected content type {content_type!r}")
        body = response.read(2_000_000).decode(response.headers.get_content_charset() or "utf-8", errors="replace")
    parser = TextParser()
    parser.feed(body)
    return " ".join(parser.text)


def needs_verification(last_verified: object, checked: str) -> bool:
    try:
        return (date.fromisoformat(checked) - date.fromisoformat(str(last_verified))).days >= CHECK_RECORD_INTERVAL_DAYS
    except (TypeError, ValueError):
        return True


def reverify(
    events: list[dict],
    checked: str,
    *,
    fetcher=fetch_page_text,
    robots=robots_allows,
    delay: float = 0.0,
    blocked_hosts: set[str] | None = None,
) -> list[dict]:
    today = date.fromisoformat(checked)
    blocked = blocked_hosts if blocked_hosts is not None else load_blocked_reference_hosts()
    page_cache: dict[str, tuple[str, str]] = {}
    robots_cache: dict[str, tuple[bool, str]] = {}
    results: list[dict] = []

    candidates = [
        event for event in events
        if event.get("sourceType") == "official"
        and isinstance(event.get("sourceUrl"), str)
        and event.get("sourceUrl")
        and date.fromisoformat(event["endDate"]) >= today
    ]

    for index, event in enumerate(candidates):
        url = event["sourceUrl"]
        result = {"id": event.get("id"), "sourceUrl": url, "status": "unknown", "changed": False}

        if source_host(url) in blocked:
            result["status"] = "skipped-policy"
            results.append(result)
            continue

        if url not in robots_cache:
            robots_cache[url] = robots(url)
        allowed, robots_note = robots_cache[url]
        result["robots"] = robots_note
        if not allowed:
            result["status"] = "skipped-robots"
            results.append(result)
            continue

        if url not in page_cache:
            try:
                page_cache[url] = ("ok", fetcher(url))
            except Exception as exc:  # pragma: no cover - live network evidence
                page_cache[url] = ("error", f"{type(exc).__name__}: {exc}")
            if delay and index < len(candidates) - 1:
                time.sleep(delay)

        fetch_status, payload = page_cache[url]
        if fetch_status != "ok":
            result["status"] = "fetch-error"
            result["error"] = payload
            results.append(result)
            continue

        if not page_contains_title(payload, event.get("title", "")):
            result["status"] = "title-not-found"
            results.append(result)
            continue

        result["status"] = "verified"
        if needs_verification(event.get("lastVerified"), checked):
            event["lastVerified"] = checked
            result["changed"] = True
        results.append(result)

    return results


def main() -> int:
    parser = argparse.ArgumentParser(description="Re-verify canonical current/upcoming exhibitions")
    parser.add_argument("--report", type=Path, default=ROOT / "generated/programme-reverify.json")
    parser.add_argument("--now", default=datetime.now(MELBOURNE_TZ).date().isoformat())
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--delay", type=float, default=1.0)
    args = parser.parse_args()

    path = ROOT / "data" / "events-current.json"
    events = json.loads(path.read_text(encoding="utf-8"))
    results = reverify(events, args.now, delay=args.delay)

    if args.apply:
        path.write_text(json.dumps(events, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    payload = {
        "generatedAt": args.now,
        "mode": "apply" if args.apply else "report-only",
        "policy": "canonical first-party source URLs only; reference-only hosts blocked; title-presence reverification; preserve on ambiguity",
        "summary": {
            "checked": len(results),
            "verified": sum(item["status"] == "verified" for item in results),
            "changed": sum(item.get("changed") is True for item in results),
            "preserved": sum(item["status"] != "verified" for item in results),
        },
        "results": results,
    }
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(
        f"programme reverify: {payload['summary']['verified']}/{payload['summary']['checked']} verified, "
        f"{payload['summary']['changed']} verification dates advanced, {payload['summary']['preserved']} preserved"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
