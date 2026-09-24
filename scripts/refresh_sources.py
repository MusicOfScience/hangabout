#!/usr/bin/env python3
"""Refresh permitted first-party studio listings into a reviewable data proposal.

The default mode is report-only. ``--apply`` updates only vacancy records whose
source page exposed an explicit availability value; failed, blocked and
ambiguous checks preserve the last good record and verification date.
"""

from __future__ import annotations

import argparse
import json
import re
import time
from datetime import date, datetime
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlparse
from urllib.request import Request, urlopen
from urllib.robotparser import RobotFileParser
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parents[1]
USER_AGENT = "hangabout-source-refresh/0.1 (+https://github.com/MusicOfScience/hangabout)"
TIMEOUT = 20
CHECK_RECORD_INTERVAL_DAYS = 7
MELBOURNE_TZ = ZoneInfo("Australia/Melbourne")


def load_allowed_hosts() -> set[str]:
    policy = json.loads((ROOT / "sources" / "source-policy.json").read_text(encoding="utf-8"))
    return {
        str(source.get("host", "")).lower().removeprefix("www.")
        for source in policy.get("refreshSources", [])
        if source.get("automationAllowed") is True and source.get("host")
    }


class PageParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.text: list[str] = []
        self.links: list[str] = []
        self._href: str | None = None
        self._script_depth = 0
        self._script_data: list[str] = []
        self.json_ld: list[dict] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]):
        values = dict(attrs)
        if tag.lower() == "a" and values.get("href"):
            self.links.append(values["href"] or "")
        if tag.lower() == "script" and values.get("type", "").lower() == "application/ld+json":
            self._script_depth = 1
            self._script_data = []

    def handle_endtag(self, tag: str):
        if tag.lower() == "script" and self._script_depth:
            try:
                payload = json.loads("".join(self._script_data))
                self.json_ld.extend(payload if isinstance(payload, list) else [payload])
            except json.JSONDecodeError:
                pass
            self._script_depth = 0
            self._script_data = []

    def handle_data(self, data: str):
        if self._script_depth:
            self._script_data.append(data)
        else:
            self.text.append(data)


def clean(value: str) -> str:
    return re.sub(r"\s+", " ", value).strip()


def robots_allows(url: str) -> tuple[bool, str]:
    parsed = urlparse(url)
    robots_url = f"{parsed.scheme}://{parsed.netloc}/robots.txt"
    parser = RobotFileParser(robots_url)
    try:
        parser.read()
    except Exception as exc:  # pragma: no cover - exercised by live workflow
        return False, f"robots unavailable: {type(exc).__name__}"
    return parser.can_fetch(USER_AGENT, url), robots_url


def fetch_html(url: str) -> str:
    request = Request(url, headers={"User-Agent": USER_AGENT, "Accept": "text/html,application/xhtml+xml"})
    with urlopen(request, timeout=TIMEOUT) as response:
        content_type = response.headers.get("Content-Type", "")
        if "html" not in content_type.lower():
            raise RuntimeError(f"unexpected content type {content_type!r}")
        return response.read(2_000_000).decode(response.headers.get_content_charset() or "utf-8", errors="replace")


def parse_availability(text: str) -> tuple[str, str] | None:
    match = re.search(r"\bavailability\b\s*[:\-]?\s*(available now|available|occupied|waitlist|wait list|not available)", text, re.I)
    if not match:
        return None
    value = clean(match.group(1)).lower()
    status = "advertised" if value.startswith("available") else "occupied" if value == "occupied" else "waitlist" if "wait" in value else "expired"
    return value, status


def parse_price(text: str) -> tuple[str, float, str] | None:
    match = re.search(r"(?:from\s+|starting at\s+)?\$\s*([\d,]+(?:\.\d+)?)\s+per\s+(month|week|day|hour)", text, re.I)
    if not match:
        return None
    amount = float(match.group(1).replace(",", ""))
    period = match.group(2).lower()
    prefix = "from " if re.search(r"from\s+|starting at\s+", match.group(0), re.I) else ""
    return f"{prefix}A${match.group(1)}/{period} + GST", amount, period


def parse_studio_page(html: str) -> dict:
    parser = PageParser()
    parser.feed(html)
    text = clean(" ".join(parser.text))
    availability = parse_availability(text)
    price = parse_price(text)
    if not availability:
        raise ValueError("explicit Availability field not found")
    return {
        "availability": availability[0],
        "availabilityStatus": availability[1],
        "price": price[0] if price else None,
        "priceAmount": price[1] if price else None,
        "pricePeriod": price[2] if price else None,
        "candidateLinks": [href for href in parser.links if "/space/" in href],
    }


def source_allowed(url: str, allowed_hosts: set[str] | None = None) -> bool:
    hosts = allowed_hosts if allowed_hosts is not None else load_allowed_hosts()
    return urlparse(url).netloc.lower().removeprefix("www.") in hosts


def refresh_vacancy(vacancy: dict, checked: str, allowed_hosts: set[str] | None = None) -> dict:
    url = vacancy.get("sourceUrl", "")
    result = {"premisesId": vacancy.get("premisesId"), "sourceUrl": url, "status": "unsupported-source"}
    if not source_allowed(url, allowed_hosts):
        return result
    allowed, robots_note = robots_allows(url)
    result["robots"] = robots_note
    if not allowed:
        result["status"] = "skipped-robots"
        return result
    try:
        parsed = parse_studio_page(fetch_html(url))
    except Exception as exc:  # pragma: no cover - network outcomes are workflow evidence
        result["status"] = "fetch-or-parse-error"
        result["error"] = f"{type(exc).__name__}: {exc}"
        return result
    result.update({"status": "ok", "checkedAt": checked, "observed": parsed})
    changed = any(parsed.get(key) and parsed.get(key) != vacancy.get(key) for key in ("availability", "price", "priceAmount", "pricePeriod", "availabilityStatus"))
    result["changed"] = changed
    return result


def apply_results(vacancies: list[dict], results: list[dict]) -> None:
    by_premise = {row.get("premisesId"): row for row in vacancies}
    for result in results:
        if result.get("status") != "ok":
            continue
        observed = result["observed"]
        row = by_premise[result["premisesId"]]
        for key in ("availability", "availabilityStatus", "price", "priceAmount", "pricePeriod"):
            if observed.get(key) is not None:
                row[key] = observed[key]
        previous = row.get("lastVerified")
        try:
            age = (date.fromisoformat(result["checkedAt"]) - date.fromisoformat(previous)).days
        except (TypeError, ValueError):
            age = CHECK_RECORD_INTERVAL_DAYS
        # Successful checks are retained in the report every run, but avoid
        # creating a daily PR when the source facts are unchanged. Record a
        # new verification date when facts change or the weekly freshness
        # interval has elapsed.
        if result.get("changed") or age >= CHECK_RECORD_INTERVAL_DAYS:
            row["lastVerified"] = result["checkedAt"]
        row["checkStatus"] = "ok"


def main() -> None:
    parser = argparse.ArgumentParser(description="Refresh permitted first-party studio listings")
    parser.add_argument("--report", type=Path, default=ROOT / "generated/source-refresh.json")
    parser.add_argument(
        "--now",
        default=datetime.now(MELBOURNE_TZ).date().isoformat(),
        help="verification date (YYYY-MM-DD; defaults to Australia/Melbourne)",
    )
    parser.add_argument("--apply", action="store_true", help="write successful observations to data/studio-vacancies.json")
    parser.add_argument("--delay", type=float, default=1.0)
    args = parser.parse_args()
    vacancies_path = ROOT / "data/studio-vacancies.json"
    vacancies = json.loads(vacancies_path.read_text(encoding="utf-8"))
    allowed_hosts = load_allowed_hosts()
    results = []
    for index, vacancy in enumerate(vacancies):
        results.append(refresh_vacancy(vacancy, args.now, allowed_hosts))
        if index < len(vacancies) - 1 and args.delay:
            time.sleep(args.delay)
    if args.apply:
        apply_results(vacancies, results)
        vacancies_path.write_text(json.dumps(vacancies, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    payload = {
        "generatedAt": args.now,
        "mode": "apply" if args.apply else "report-only",
        "sourcePolicy": "permitted first-party pages only",
        "results": results,
        "summary": {
            "checked": len(results),
            "ok": sum(item.get("status") == "ok" for item in results),
            "changed": sum(item.get("changed") is True for item in results),
            "preserved": sum(item.get("status") != "ok" for item in results),
        },
    }
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"source refresh: {payload['summary']['ok']}/{len(results)} fetched, {payload['summary']['changed']} changed, {payload['summary']['preserved']} preserved")


if __name__ == "__main__":
    main()
