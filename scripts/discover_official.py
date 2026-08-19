#!/usr/bin/env python3
"""Discover exhibition/program links from stable first-party venue index pages.

This is intentionally a discovery pass, not a content scraper. It records candidate
URLs and link labels for review, and never fetches reference-only directory sources.
"""

from __future__ import annotations

import json
import time
from datetime import datetime, timezone
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urljoin, urlparse, urldefrag
from urllib.request import Request, urlopen
from urllib.robotparser import RobotFileParser

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "generated" / "source-discovery.json"
USER_AGENT = "hangabout-source-discovery/0.1 (+https://github.com/MusicOfScience/hangabout)"
TIMEOUT = 20


class LinkParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.links = []
        self._href = None
        self._text = []

    def handle_starttag(self, tag, attrs):
        if tag.lower() != "a":
            return
        values = dict(attrs)
        self._href = values.get("href")
        self._text = []

    def handle_data(self, data):
        if self._href is not None:
            self._text.append(data)

    def handle_endtag(self, tag):
        if tag.lower() == "a" and self._href is not None:
            label = " ".join("".join(self._text).split())
            self.links.append((self._href, label))
            self._href = None
            self._text = []


def load(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def normal_host(url: str) -> str:
    return urlparse(url).netloc.lower().removeprefix("www.")


def robots_allows(url: str):
    parsed = urlparse(url)
    robots_url = f"{parsed.scheme}://{parsed.netloc}/robots.txt"
    parser = RobotFileParser()
    parser.set_url(robots_url)
    try:
        parser.read()
    except Exception as exc:
        return False, f"robots unavailable: {type(exc).__name__}"
    return parser.can_fetch(USER_AGENT, url), robots_url


def fetch_html(url: str) -> str:
    request = Request(url, headers={"User-Agent": USER_AGENT, "Accept": "text/html,application/xhtml+xml"})
    with urlopen(request, timeout=TIMEOUT) as response:
        content_type = response.headers.get("Content-Type", "")
        if "html" not in content_type.lower():
            raise RuntimeError(f"unexpected content type {content_type!r}")
        return response.read(2_000_000).decode(response.headers.get_content_charset() or "utf-8", errors="replace")


def discover(source: dict) -> dict:
    venue_id = source["venueId"]
    index_url = source["indexUrl"]
    result = {
        "venueId": venue_id,
        "name": source["name"],
        "indexUrl": index_url,
        "status": "unknown",
        "links": [],
    }

    allowed, robots_note = robots_allows(index_url)
    result["robots"] = robots_note
    if not allowed:
        result["status"] = "skipped-robots"
        return result

    try:
        html = fetch_html(index_url)
    except Exception as exc:
        result["status"] = "fetch-error"
        result["error"] = f"{type(exc).__name__}: {exc}"
        return result

    parser = LinkParser()
    parser.feed(html)

    index_host = normal_host(index_url)
    patterns = source.get("includePathPatterns", [])
    found = {}
    for href, label in parser.links:
        absolute = urldefrag(urljoin(index_url, href))[0]
        parsed = urlparse(absolute)
        if parsed.scheme not in {"http", "https"}:
            continue
        if source.get("sameDomainOnly", True) and normal_host(absolute) != index_host:
            continue
        if patterns and not any(parsed.path.startswith(pattern) or pattern in parsed.path for pattern in patterns):
            continue
        if absolute.rstrip("/") == index_url.rstrip("/"):
            continue
        found.setdefault(absolute, label)

    result["links"] = [
        {"url": url, "label": label}
        for url, label in sorted(found.items())
    ]
    result["status"] = "ok"
    result["count"] = len(result["links"])
    return result


def main():
    sources = load(ROOT / "sources" / "official-indexes.json")
    results = []
    for i, source in enumerate(sources):
        if source.get("automationAllowed") is not True:
            results.append({"venueId": source.get("venueId"), "status": "skipped-policy"})
            continue
        results.append(discover(source))
        if i < len(sources) - 1:
            time.sleep(1.0)

    payload = {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "purpose": "candidate first-party programme URLs for human review; not republished source content",
        "sources": results,
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    ok = sum(item.get("status") == "ok" for item in results)
    links = sum(item.get("count", 0) for item in results)
    print(f"discovery complete: {ok}/{len(results)} sources fetched, {links} candidate links")


if __name__ == "__main__":
    main()
