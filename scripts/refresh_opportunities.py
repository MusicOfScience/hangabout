"""Check reviewed opportunity sources and produce a non-destructive catalogue proposal."""

import argparse
import hashlib
import json
import math
import re
import sys
import time
from datetime import date, datetime, timedelta, timezone
from http.client import HTTPException
from pathlib import Path
from tempfile import NamedTemporaryFile
from urllib.error import HTTPError
from urllib.parse import urljoin, urlsplit, urlunsplit
from urllib.request import HTTPRedirectHandler, Request, build_opener
from urllib.robotparser import RobotFileParser
from zoneinfo import ZoneInfo

from opportunity_adapters import (
    ADAPTERS, DIRECTORY_ADAPTERS, SOURCE_DETAIL_PATHS, artsact_cultural_round_url, links, page_text, ramsay_terms_url,
)

ROOT = Path(__file__).resolve().parents[1]
REGISTRY = ROOT / "sources/opportunity-sources.json"
CATALOGUE = ROOT / "data/opportunities.json"
USER_AGENT = "hangabout-opportunities/1.0 (+https://github.com/MusicOfScience/hangabout)"
MAX_BODY = 2_000_000
CATEGORIES = {
    "artist-grant", "fellowship", "scholarship-bursary", "residency", "professional-development",
    "mentorship-masterclass", "materials-equipment", "studio-workspace", "commission",
    "exhibition-opportunity", "prize-award", "cultural-exchange", "travel-mobility",
    "research-experimental", "emergency-assistance", "disability-specific",
}
FUNDING_TYPES = {"direct", "in-kind", "partial", "unfunded", "participant-expenditure", "paid-placement", "unknown"}
VERIFICATION = {"verified", "partially-verified", "discovery-only", "stale", "quarantined"}
STATUSES = {"forthcoming", "open", "closing-soon", "closed", "suspended", "unknown"}


def read_json(path):
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path, payload):
    path.parent.mkdir(parents=True, exist_ok=True)
    with NamedTemporaryFile(mode="w", encoding="utf-8", dir=path.parent, delete=False) as temp:
        temp.write(json.dumps(payload, ensure_ascii=False, indent=2, allow_nan=False) + "\n")
    Path(temp.name).replace(path)


def digest(value):
    return hashlib.sha256(json.dumps(value, ensure_ascii=False, sort_keys=True).encode()).hexdigest()


def check(condition, message):
    if not condition:
        raise ValueError(message)


def url_key(url):
    parts = urlsplit(url)
    check(parts.scheme == "https" and parts.hostname and not parts.username and not parts.password
          and parts.port in {None, 443}, f"expected a public HTTPS URL: {url}")
    return urlunsplit(("https", parts.hostname.lower(), parts.path.rstrip("/") or "/", parts.query, ""))


def timestamp(value):
    parsed = datetime.fromisoformat(value)
    check(parsed.tzinfo is not None and "T" in value, f"expected an offset timestamp: {value}")
    return parsed


def iso_date(value):
    parsed = date.fromisoformat(value)
    check(parsed.isoformat() == value, f"expected an ISO calendar date: {value}")
    return parsed


def text_or_unknown(value):
    return value is None or isinstance(value, str) and bool(value.strip())


def strings_or_unknown(value):
    return value is None or isinstance(value, list) and bool(value) and all(
        isinstance(item, str) and item.strip() for item in value)


def valid_amount(value):
    return type(value) in {int, float} and math.isfinite(value) and value >= 0


def currency(value):
    return isinstance(value, str) and re.fullmatch(r"[A-Z]{3}", value) and value not in {"XXX", "XTS"}


def validate_registry(registry):
    check(registry["schemaVersion"] == 1, "unsupported source registry version")
    sources = {}
    for source in registry["sources"]:
        source_id = source["id"]
        check(re.fullmatch(r"[a-z0-9-]+", source_id) and source_id not in sources, "duplicate or invalid source ID")
        url_key(source["url"])
        check(source["role"] in {"funder", "directory", "fundraising", "mixed"}, f"invalid role for {source_id}")
        check(source["state"] in {"active", "discovery", "seed", "reference"}, f"invalid source state for {source_id}")
        if source["state"] in {"active", "discovery"}:
            check(type(source["intervalDays"]) is int and source["intervalDays"] > 0, "invalid check interval")
            iso_date(source["reviewedOn"])
            check(source["remit"], "source review evidence is required")
        if source["state"] == "discovery":
            check(source["role"] == "directory" and source["adapter"] in DIRECTORY_ADAPTERS
                  and source["mechanism"] == "directoryHTML", "discovery sources require a directory adapter")
        if source["state"] == "active":
            check(source["role"] == "funder" and source["adapter"] in ADAPTERS, "active sources require a funder adapter")
            check(type(source["staleDays"]) is int and source["intervalDays"] < source["staleDays"], "invalid stale interval")
            check(source["mechanism"] == "officialHTML", "source review evidence is required")
            if source.get("supportingUrl"):
                supporting = url_key(source["supportingUrl"])
                check(urlsplit(supporting).hostname == urlsplit(source["url"]).hostname
                      and supporting != url_key(source["url"]), "supporting page must be a separate first-party URL")
        if source.get("termsUrl"):
            url_key(source["termsUrl"])
        sources[source_id] = source
    return sources


def canonical_url(url, aliases):
    key = url_key(url)
    return aliases.get(key, key)


def identity(record, aliases):
    return canonical_url(record["officialUrl"], aliases), record["roundKey"]


def validate_record(record, sources):
    check(re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", record["id"]), "invalid opportunity ID")
    check(re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", record["roundKey"]), "invalid round key")
    check(all(isinstance(record[key], str) and record[key].strip() for key in
              ("title", "organisation", "summary")), "title, organisation and summary are required")
    for field in ("applicationRequirements", "selectionCriteria", "restrictions", "uncertainties"):
        check(text_or_unknown(record[field]), f"invalid editorial field: {field}")
    source = sources[record["sourceId"]]
    check(record["organisation"] == source["name"] and source["role"] == "funder", "invalid funding organisation")
    official = urlsplit(url_key(record["officialUrl"]))
    check(official.hostname == urlsplit(source["url"]).hostname, "official URL is outside the reviewed source")
    if record["applicationUrl"] is not None:
        url_key(record["applicationUrl"])
    discovery = record["discoverySources"]
    check(isinstance(discovery, list) and bool(discovery), "missing discovery provenance")
    for item in discovery:
        check(item["sourceId"] in sources, "unknown discovery source")
        url_key(item["url"])
    check(url_key(record["verificationUrl"]) == url_key(record["officialUrl"]), "invalid verification provenance")
    if record.get("supportingEvidenceUrl"):
        supporting = url_key(record["supportingEvidenceUrl"])
        check(urlsplit(supporting).hostname == official.hostname and supporting != url_key(record["officialUrl"]),
              "invalid supporting evidence URL")
    check(record["verificationStatus"] in VERIFICATION, "invalid verification status")
    check(timestamp(record["firstDiscoveredAt"]) <= timestamp(record["lastVerifiedAt"])
          <= timestamp(record["lastCheckedAt"]), "inconsistent verification timestamps")
    check(type(record["staleAfterDays"]) is int and record["staleAfterDays"] > 0, "invalid freshness interval")
    check(re.fullmatch(r"[a-f0-9]{64}", record["contentHash"])
          and re.fullmatch(r"[a-f0-9]{64}", record["evidenceHash"]), "invalid content fingerprint")

    categories = record["categories"]
    check(isinstance(categories, list) and categories and len(categories) == len(set(categories))
          and set(categories) <= CATEGORIES, "invalid categories")
    funding = record["funding"]
    check(funding["type"] in FUNDING_TYPES, "invalid funding type")
    check(funding["fullyFunded"] is None or type(funding["fullyFunded"]) is bool, "invalid fully-funded evidence")
    check(funding["fullyFunded"] is not True or funding["type"] not in {"partial", "unfunded", "participant-expenditure", "unknown"},
          "fully-funded flag conflicts with funding type")
    check(funding["currency"] is None or currency(funding["currency"]), "invalid funding currency")
    if funding["type"] == "paid-placement":
        check(funding["minimum"] is None and funding["maximum"] is None and funding["currency"] is None,
              "host employment must not be represented as a grant amount")
    for field in ("minimum", "maximum"):
        check(funding[field] is None or valid_amount(funding[field]) and currency(funding["currency"]),
              f"invalid funding {field} or missing currency")
    if funding["minimum"] is not None and funding["maximum"] is not None:
        check(funding["minimum"] <= funding["maximum"], "funding minimum is above maximum")
    for field in ("applicationFee", "participationFee"):
        value = funding[field]
        check(value is None or isinstance(value, dict) and valid_amount(value.get("amount")) and
              currency(value.get("currency")), f"invalid {field}")
    for field in ("coContribution", "travel", "accommodation", "materials", "otherCosts", "conditions"):
        check(text_or_unknown(funding[field]), f"invalid funding field: {field}")

    eligible = record["eligibility"]
    check(eligible["scope"] in {"national", "state", "municipality", "international", "unknown"}, "invalid geographic scope")
    check(eligible["geographicConfidence"] in {"confirmed", "potential", "unknown"}, "invalid geographic confidence")
    check(eligible["disabilitySpecific"] is None or type(eligible["disabilitySpecific"]) is bool, "invalid disability eligibility")
    for field in ("geography", "criteria", "citizenship", "residency", "age", "qualifications", "specialistCriteria", "accessibility"):
        check(text_or_unknown(eligible[field]), f"invalid eligibility field: {field}")
    for field in ("countries", "states", "municipalities", "disciplines", "careerStages", "applicantTypes"):
        check(strings_or_unknown(eligible[field]), f"invalid eligibility list: {field}")
    if eligible["countries"]:
        check(all(re.fullmatch(r"[A-Z]{2}", country) for country in eligible["countries"]), "invalid country codes")
    if eligible["states"]:
        check(set(eligible["states"]) <= {"VIC", "NSW", "QLD", "SA", "WA", "TAS", "ACT", "NT"}, "invalid state codes")
    check(eligible["scope"] != "state" or eligible["states"], "state opportunity needs a state")
    check(eligible["scope"] != "municipality" or eligible["states"] and eligible["municipalities"],
          "municipal opportunity needs a state and municipality")

    timing = record["timing"]
    status = timing["observedStatus"]
    check(status in STATUSES, "invalid lifecycle state")
    if record["verificationStatus"] in {"discovery-only", "quarantined"}:
        check(status not in {"open", "closing-soon"}, "unverified discovery cannot claim open applications")
    check(type(timing["rolling"]) is bool, "invalid rolling indicator")
    check(not timing["rolling"] or timing["closingDate"] is None, "rolling listing conflicts with dated deadline")
    for field in ("openingDate", "closingDate", "commencementDate"):
        if timing[field] is not None:
            iso_date(timing[field])
    if timing["openingDate"] and timing["closingDate"]:
        check(timing["openingDate"] <= timing["closingDate"], "closing date precedes opening date")
    zone = ZoneInfo(timing["deadlineTimezone"]) if timing["deadlineTimezone"] else None
    for field, day_field in (("opensAt", "openingDate"), ("closesAt", "closingDate")):
        if timing[field] is not None:
            instant = timestamp(timing[field])
            check(zone and instant.utcoffset() == instant.astimezone(zone).utcoffset()
                  and instant.date().isoformat() == timing[day_field], f"{field} does not agree with its local date and zone")
    if timing["opensAt"] and timing["closesAt"]:
        check(timestamp(timing["opensAt"]) < timestamp(timing["closesAt"]), "deadline precedes opening time")
    if status in {"open", "closing-soon"}:
        check(record["applicationUrl"] and (timing["rolling"] or timing["closingDate"]),
              "open status requires application evidence and a deadline or rolling intake")
    check(text_or_unknown(timing["duration"]) and text_or_unknown(timing["recurrence"]), "invalid timing details")


def validate_catalogue(catalogue, sources):
    check(catalogue["schemaVersion"] == 1, "unsupported opportunity catalogue version")
    aliases = {}
    for alias, target in catalogue["officialUrlAliases"].items():
        check(url_key(alias) == alias and url_key(target) == target and alias != target, "invalid reviewed URL alias")
        check(target not in catalogue["officialUrlAliases"], "URL aliases must target a canonical URL")
        aliases[alias] = target
    ids, identities = set(), set()
    for record in catalogue["opportunities"]:
        validate_record(record, sources)
        key = identity(record, aliases)
        check(record["id"] not in ids and key not in identities, "duplicate opportunity or original funder round")
        ids.add(record["id"])
        identities.add(key)


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


class PublicFetcher:
    def __init__(self):
        self.opener = build_opener(NoRedirect())
        self.robots = {}
        self.last_request = {}

    def request(self, url, accept, delay):
        host = urlsplit(url).hostname
        for attempt in range(3):
            time.sleep(max(0, delay - (time.monotonic() - self.last_request.get(host, 0))))
            self.last_request[host] = time.monotonic()
            try:
                request = Request(url, headers={"User-Agent": USER_AGENT, "Accept": accept})
                with self.opener.open(request, timeout=15) as response:
                    check(response.headers.get_content_type() in accept.split(","),
                          f"unexpected response type for {url}")
                    data = response.read(MAX_BODY + 1)
                    check(len(data) <= MAX_BODY, f"response exceeds size limit: {url}")
                    return data.decode(response.headers.get_content_charset() or "utf-8", errors="replace")
            except HTTPError as error:
                if error.code not in {408, 429, 500, 502, 503, 504} or error.headers.get("Retry-After"):
                    raise
                if attempt == 2:
                    raise
            except (OSError, HTTPException):
                if attempt == 2:
                    raise
            time.sleep(2 ** attempt)

    def html(self, url):
        url_key(url)
        origin = urlsplit(url)
        host = origin.hostname
        if host not in self.robots:
            robots_url = urlunsplit(("https", origin.netloc, "/robots.txt", "", ""))
            robots = RobotFileParser(robots_url)
            robots.parse(self.request(robots_url, "text/plain", 1).splitlines())
            self.robots[host] = robots
        robots = self.robots[host]
        if not robots.can_fetch(USER_AGENT, url):
            raise ValueError("robots.txt disallows this page")
        # Respect the source pause between the robots request and a page request too.
        delay = max(1, robots.crawl_delay(USER_AGENT) or 0)
        return self.request(url, "text/html,application/xhtml+xml", delay)


class QuarantineError(ValueError):
    pass


def observe(source, fetch, now):
    url = source["url"]
    html = fetch(url)
    pages = [(url, html)]
    detail_path = SOURCE_DETAIL_PATHS.get(source["adapter"])
    if detail_path:
        urls = {url_key(link): link for link, _ in links(html, url)
                if urlsplit(link).scheme == "https" and urlsplit(link).netloc == urlsplit(url).netloc
                and re.fullmatch(detail_path, urlsplit(link).path)}
        if not 1 <= len(urls) <= 5:
            raise QuarantineError("programme index returned an unexpected number of round pages")
        pages = [(urls[key], fetch(urls[key])) for key in sorted(urls)]

    observations = []
    for official_url, content in pages:
        supporting_url = source.get("supportingUrl")
        application_evidence_url = None
        try:
            if source["adapter"] == "ramsay":
                supporting_url = ramsay_terms_url(official_url, content)
            if source["adapter"] == "artsact-cultural":
                application_evidence_url = artsact_cultural_round_url(official_url, content)
        except ValueError as error:
            raise QuarantineError(f"{official_url}: {error}") from error
        evidence_url = application_evidence_url or supporting_url
        supporting_html = fetch(evidence_url) if evidence_url else None
        try:
            records = ADAPTERS[source["adapter"]](official_url, content, now, supporting_html)
            check(bool(records), "adapter returned no records")
            evidence = page_text(content)
            evidence_hash = digest([evidence, page_text(supporting_html)] if supporting_html else evidence)
            for record in records:
                record["evidenceHash"] = evidence_hash
                if supporting_url:
                    record["supportingEvidenceUrl"] = supporting_url
                record["funding"].setdefault("fullyFunded", None)
                observations.append(record)
        except (ValueError, KeyError) as error:
            raise QuarantineError(f"{official_url}: {error}") from error
    return observations


def observe_directory(source, fetch):
    url = source["url"]
    html = fetch(url)
    try:
        return DIRECTORY_ADAPTERS[source["adapter"]](url, html)
    except ValueError as error:
        raise QuarantineError(f"{url}: {error}") from error


def merge_observations(records, observations, source, sources, aliases, now):
    checked = now.isoformat(timespec="seconds")
    proposed = records.copy()
    changes, seen = [], set()
    for incoming in observations:
        key = identity(incoming, aliases)
        check(key not in seen, "adapter returned a duplicate official round")
        seen.add(key)
        prior = records.get(key)
        classification = incoming.get("verificationStatus", "verified")
        content = incoming | {"verificationStatus": classification}
        # The evidence hash also triggers review when source text changes outside mapped fields.
        content_hash = digest(content)
        discovered = {"sourceId": source["id"], "url": source["url"]}
        if prior and prior["sourceId"] != source["id"]:
            # A reviewed alias can contribute discovery provenance. The original
            # funder remains responsible for the canonical facts and freshness.
            if discovered not in prior["discoverySources"]:
                proposed[key] = prior | {"discoverySources": [*prior["discoverySources"], discovered]}
                changes.append({"id": prior["id"], "change": "additional-provenance", "url": prior["officialUrl"]})
            continue
        if prior and prior["contentHash"] == content_hash and prior["verificationStatus"] == classification:
            verification_interval = max(source["intervalDays"], source["staleDays"] // 2)
            if now - timestamp(prior["lastVerifiedAt"]) < timedelta(days=verification_interval):
                continue
        provenance = list(prior["discoverySources"]) if prior else []
        if discovered not in provenance:
            provenance.append(discovered)
        record = content | dict(
            id=prior["id"] if prior else f'{source["id"]}-{incoming["roundKey"]}',
            sourceId=source["id"], organisation=source["name"], discoverySources=provenance,
            verificationUrl=incoming["officialUrl"], firstDiscoveredAt=prior["firstDiscoveredAt"] if prior else checked,
            lastCheckedAt=checked, lastVerifiedAt=checked, staleAfterDays=source["staleDays"], contentHash=content_hash,
        )
        validate_record(record, sources)
        proposed[key] = record
        kind = ("new" if not prior else "verified-again" if prior["contentHash"] == content_hash else "changed")
        changes.append({"id": record["id"], "change": kind, "url": record["officialUrl"]})
    # Reused or removed programme links must not continue to signal live applications.
    for key, record in records.items():
        if key in seen or record["sourceId"] != source["id"] or record["verificationStatus"] == "stale":
            continue
        if record["timing"]["observedStatus"] in {"closed", "suspended"}:
            continue
        proposed[key] = record | {"verificationStatus": "stale", "lastCheckedAt": checked}
        changes.append({"id": record["id"], "change": "no-longer-listed", "url": record["officialUrl"]})
    return proposed, changes


def refresh(catalogue, sources, fetch, now, last_success, always=False):
    aliases = catalogue["officialUrlAliases"]
    records = {identity(record, aliases): record for record in catalogue["opportunities"]}
    health = {}
    result = {"checkedAt": now.isoformat(timespec="seconds"), "sources": health, "changes": [], "discoveryLeads": []}
    for source_id, source in sources.items():
        if source["state"] not in {"active", "discovery"}:
            continue
        discovery_only = source["state"] == "discovery"
        previous = last_success.get(source_id)
        if previous is None:
            previous = max((record["lastVerifiedAt"] for record in records.values()
                            if record["sourceId"] == source_id), default=None)
        row = health[source_id] = {"url": source["url"], "lastSuccessfulFetchAt": previous}
        if not always and previous and now - timestamp(previous) < timedelta(days=source["intervalDays"]):
            row["status"] = "not-due"
            continue
        try:
            observations = observe_directory(source, fetch) if discovery_only else observe(source, fetch, now)
        except QuarantineError as error:
            row.update(status="quarantined", detail=str(error))
            continue
        except HTTPError as error:
            row.update(status="fetch-failed", detail=str(error), failedUrl=error.geturl())
            continue
        except (OSError, HTTPException, ValueError, LookupError) as error:
            row.update(status="fetch-failed", detail=str(error))
            continue
        row["lastSuccessfulFetchAt"] = result["checkedAt"]
        if discovery_only:
            result["discoveryLeads"].extend({"sourceId": source_id, "url": url} for url in observations)
            row.update(status="ok", observed=len(observations))
            continue
        try:
            proposed, changes = merge_observations(records, observations, source, sources, aliases, now)
            validate_catalogue(catalogue | {"opportunities": list(proposed.values())}, sources)
        except (ValueError, KeyError, TypeError) as error:
            row.update(status="quarantined", detail=str(error))
            continue
        records = proposed
        result["changes"].extend(changes)
        row.update(status="ok", observed=len(observations))
    candidate = catalogue | {"opportunities": sorted(records.values(), key=lambda record: record["id"])}
    validate_catalogue(candidate, sources)
    if result["discoveryLeads"]:
        known = {}
        for record in candidate["opportunities"]:
            for item in record["discoverySources"]:
                key = item["sourceId"], url_key(item["url"])
                known.setdefault(key, []).append(record["id"])
        for lead in result["discoveryLeads"]:
            lead["catalogueIds"] = known.get((lead["sourceId"], url_key(lead["url"])), [])
    return candidate, result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--validate", action="store_true", help="validate the committed catalogue without any network access")
    parser.add_argument("--force", action="store_true", help="check all active sources regardless of interval")
    parser.add_argument("--previous-report", type=Path, help="previous workflow report for source-specific scheduling")
    parser.add_argument("--apply", action="store_true", help="write validated proposals to the local catalogue")
    parser.add_argument("--report", type=Path, default=ROOT / "generated/opportunity-refresh.json")
    args = parser.parse_args()
    sources = validate_registry(read_json(REGISTRY))
    catalogue = read_json(CATALOGUE)
    validate_catalogue(catalogue, sources)
    if args.validate:
        print(f"Validated {len(catalogue['opportunities'])} opportunities and {len(sources)} source entries.")
        return
    previous = read_json(args.previous_report)["sources"] if args.previous_report else {}
    last_success = {source: row.get("lastSuccessfulFetchAt") for source, row in previous.items()}
    fetcher = PublicFetcher()
    candidate, report = refresh(catalogue, sources, fetcher.html, datetime.now(timezone.utc), last_success, args.force)
    write_json(args.report, report)
    if args.apply and candidate != catalogue:
        write_json(CATALOGUE, candidate)
    for source, row in report["sources"].items():
        print(f"{source}: {row['status']} · {row.get('observed', 0)} observed · {row.get('detail', '')}")
    print(f"{len(report['changes'])} changes proposed. {len(candidate['opportunities'])} retained opportunities.")
    print(f"{len(report['discoveryLeads'])} discovery leads for review.")
    funder_results = (row for source_id, row in report["sources"].items() if sources[source_id]["state"] == "active")
    if all(row["status"] in {"fetch-failed", "quarantined"} for row in funder_results):
        sys.exit("All opportunity funder checks failed. The validated catalogue was preserved.")


if __name__ == "__main__":
    main()
