from copy import deepcopy
from datetime import datetime, timedelta, timezone
from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "scripts"))
from opportunity_adapters import local_date, local_instant, potter, pkf, wyndham
from refresh_opportunities import (
    CATALOGUE, REGISTRY, identity, merge_observations, observe, read_json, refresh,
    url_key, validate_catalogue, validate_record, validate_registry,
)


PKF_PAGE = """<main><p>Artists throughout the world are encouraged to apply.</p>
<p>A minimum of 10 exhibitions within the past 10 years.</p>
<ul><li>Painting</li><li>Sculpture</li><li>Works on paper (including printmaking)</li></ul>
<ul><li>Cover letter</li><li>Artist statement</li><li>Current resume or CV</li>
<li>10 digital images of recent work</li><li>Three professional references</li></ul>
<ul><li>Grant amount: Up to $50,000</li><li>Use of funds: Unrestricted</li>
<li>Grant period: Intended for one year</li><li>Application deadline: None (rolling application)</li></ul>
<a href="https://bbgm-apply.yourcausegrants.com/apply/programs/abc-def">Apply online</a></main>"""

POTTER_PAGE = """<main><h3>Current Round | Round 1, 2027</h3>
<h3>Important Dates</h3><h5>Applications</h5>
<table><tr><td>Open</td><td>Tuesday 24 November 2026</td></tr>
<tr><td>Close</td><td>Tuesday 19 January 2027, 5PM AEDT</td></tr></table>
<h5>For travel/projects after</h5><div>1 April 2027</div>
<p>Individual artists can apply for grants of up to $15,000.</p>
<p>Australian citizen or Permanent Resident of Australia.</p><p>Emerging or early-career artist.</p>
<p>Primarily funds projects undertaken overseas.</p><p>Make a reasonable personal financial contribution.</p>
<p>Minimum of 18 years old with access to an Australian bank account in their name.</p>
<p>This does not mean applicants need to have attained formal qualifications.</p>
<a href="https://ipct.givingdata.com/portal/campaign/IPCT2027Round1Application">Apply now</a></main>"""

WYNDHAM_PAGE = """<main><h1>2027 Wyndham Arts Grants</h1>
<p>Applications open: 9:00am, Wednesday 28 October 2026</p>
<p>Applications close: 3:00pm, Friday 27 November 2026</p>
<p>Across all creative genres. Grants for Creative Development and Skills Development are open to applicants who live in Wyndham.
Grants for Presentation are open to artists based in or outside of Wyndham, with all presentation outcomes taking place within Wyndham City.</p>
<p>Creative Development</p><ul><li>Up to $3,000</li></ul>
<p>Skills Development</p><ul><li>Up to $3,000</li></ul>
<p>Presentation</p><ul><li>Up to $5,000</li></ul>
<a href="https://wyndham.smartygrants.com.au/wyndhamartsgrants2027">Apply</a></main>"""

NOW = datetime(2026, 11, 24, 13, 37, tzinfo=timezone.utc)
WYNDHAM_URL = "https://www.wyndham.vic.gov.au/services/arts-culture/residencies-commissions-grants/2027-wyndham-arts-grants"
EMPTY = {"schemaVersion": 1, "officialUrlAliases": {}, "opportunities": []}


class OpportunitiesTest(unittest.TestCase):
    def setUp(self):
        self.sources = validate_registry(read_json(REGISTRY))
        self.pkf = self.sources["pollock-krasner"]
        self.potter = self.sources["ian-potter-cultural-trust"]
        self.one = {self.pkf["id"]: self.pkf}

    def test_real_catalogue_validates(self):
        catalogue = read_json(CATALOGUE)
        validate_catalogue(catalogue, self.sources)
        self.assertGreaterEqual(len({r["sourceId"] for r in catalogue["opportunities"]}), 4)
        self.assertTrue(any(r["eligibility"]["scope"] == "international" for r in catalogue["opportunities"]))
        self.assertEqual(self.sources["australian-cultural-fund"]["role"], "fundraising")

    def test_date_and_timezone_are_source_local(self):
        record, = potter(self.potter["url"], POTTER_PAGE, NOW)
        self.assertEqual(record["timing"]["closesAt"], "2027-01-19T17:00:00+11:00")
        self.assertEqual(record["timing"]["openingDate"], "2026-11-24")
        self.assertEqual(record["timing"]["commencementDate"], "2027-04-01")
        expired, = potter(self.potter["url"], POTTER_PAGE, datetime(2027, 1, 19, 6, tzinfo=timezone.utc))
        self.assertEqual(expired["timing"]["observedStatus"], "closed")
        self.assertEqual(local_instant(local_date("01 July 2027"), "3:00pm").isoformat(), "2027-07-01T15:00:00+10:00")
        with self.assertRaisesRegex(ValueError, "conflicts"):
            potter(self.potter["url"], POTTER_PAGE.replace("AEDT", "AEST"), NOW)

    def test_cancellation_requires_source_status(self):
        record, = pkf(self.pkf["url"], PKF_PAGE.replace("<main>", "<main>Applications are temporarily suspended."), NOW)
        self.assertEqual(record["timing"]["observedStatus"], "suspended")
        no_link = PKF_PAGE.replace("bbgm-apply.yourcausegrants.com", "unverified.example")
        record, = pkf(self.pkf["url"], no_link, NOW)
        self.assertEqual(record["timing"]["observedStatus"], "unknown")

    def test_council_index_discovers_distinct_streams(self):
        source = self.sources["wyndham"]
        index = f'<a href="{WYNDHAM_URL}">Grant round</a><a href="{WYNDHAM_URL}">Duplicate link</a>'
        calls = []

        def fetch(url):
            calls.append(url)
            return index if url == source["url"] else WYNDHAM_PAGE

        records = observe(source, fetch, NOW)
        self.assertEqual(calls, [source["url"], WYNDHAM_URL])
        self.assertEqual({r["funding"]["maximum"] for r in records}, {3000, 5000})
        self.assertEqual({r["roundKey"] for r in records}, {
            "2027-creative-development", "2027-skills-development", "2027-presentation",
        })
        self.assertEqual(records[-1]["eligibility"]["geographicConfidence"], "potential")
        at_close = datetime(2026, 11, 27, 4, tzinfo=timezone.utc)
        self.assertTrue(all(r["timing"]["observedStatus"] == "closed" for r in wyndham(WYNDHAM_URL, WYNDHAM_PAGE, at_close)))

    def test_currency_fee_and_status_validation(self):
        catalogue, _ = refresh(EMPTY, self.one, lambda _: PKF_PAGE, NOW, {})
        record = catalogue["opportunities"][0]
        self.assertEqual(record["funding"]["currency"], "USD")
        self.assertIsNone(record["funding"]["applicationFee"])
        self.assertIsNone(record["funding"]["participationFee"])
        free = deepcopy(record)
        free["funding"]["applicationFee"] = {"amount": 0, "currency": "USD"}
        validate_record(free, self.one)
        for field, invalid in {"currency": None, "maximum": -1, "applicationFee": 0, "fullyFunded": 1}.items():
            amended = deepcopy(record)
            amended["funding"][field] = invalid
            with self.subTest(field=field), self.assertRaises(ValueError):
                validate_record(amended, self.one)
        invalid = deepcopy(record)
        invalid["applicationUrl"] = "javascript:alert(1)"
        with self.assertRaisesRegex(ValueError, "HTTPS"):
            validate_record(invalid, self.one)

    def test_change_preserves_id_and_discovery_date(self):
        original, initial_report = refresh(EMPTY, self.one, lambda _: PKF_PAGE, NOW, {})
        record = original["opportunities"][0]
        next_day = NOW + timedelta(days=1)
        changed_page = PKF_PAGE.replace("$50,000", "$42,000").replace(
            "Use of funds: Unrestricted", "Use of funds: Unrestricted. Recipient reporting is required.")
        candidate, report = refresh(original, self.one, lambda _: changed_page, next_day, {}, always=True)
        amended = candidate["opportunities"][0]
        self.assertEqual(initial_report["changes"][0]["change"], "new")
        self.assertEqual(report["changes"][0]["change"], "changed")
        self.assertEqual(amended["id"], record["id"])
        self.assertEqual(amended["firstDiscoveredAt"], record["firstDiscoveredAt"])
        self.assertEqual(amended["funding"]["maximum"], 42000)
        self.assertNotEqual(amended["evidenceHash"], record["evidenceHash"])

    def test_failed_and_quarantined_source_preserves_validated_record(self):
        original, _ = refresh(EMPTY, self.one, lambda _: PKF_PAGE, NOW, {})
        next_week = NOW + timedelta(days=14)

        def outage(_):
            raise OSError("source unavailable")

        for fetch, status in [(outage, "fetch-failed"), (lambda _: "<main>Placeholder</main>", "quarantined")]:
            candidate, report = refresh(original, self.one, fetch, next_week, {})
            row = report["sources"][self.pkf["id"]]
            self.assertEqual(row["status"], status)
            self.assertEqual(row["lastSuccessfulFetchAt"], NOW.isoformat())
            self.assertEqual(candidate, original)

    def test_incremental_checks_and_periodic_reverification(self):
        original, _ = refresh(EMPTY, self.one, lambda _: PKF_PAGE, NOW, {})
        candidate, report = refresh(original, self.one, self.fail, NOW + timedelta(days=1), {})
        self.assertEqual(candidate, original)
        self.assertEqual(report["sources"][self.pkf["id"]]["status"], "not-due")
        candidate, report = refresh(original, self.one, lambda _: PKF_PAGE, NOW + timedelta(days=7), {})
        self.assertEqual(candidate, original)
        self.assertEqual(report["changes"], [])
        candidate, report = refresh(original, self.one, lambda _: PKF_PAGE, NOW + timedelta(days=18), {})
        self.assertNotEqual(candidate, original)
        self.assertEqual(report["changes"][0]["change"], "verified-again")

    def test_explicit_url_alias_deduplicates_cross_source_and_keeps_original(self):
        original, _ = refresh(EMPTY, self.one, lambda _: PKF_PAGE, NOW, {})
        record = original["opportunities"][0]
        duplicate_source = dict(self.pkf, id="second-observer", url="https://other.example/programme")
        sources = self.one | {"second-observer": duplicate_source}
        aliases = {duplicate_source["url"]: url_key(self.pkf["url"])}
        records = {identity(record, aliases): record}
        incoming = deepcopy(record)
        incoming["officialUrl"] = duplicate_source["url"]
        candidate, changes = merge_observations(records, [incoming], duplicate_source, sources, aliases, NOW)
        canonical, = candidate.values()
        self.assertEqual(canonical["id"], record["id"])
        self.assertEqual(canonical["officialUrl"], record["officialUrl"])
        self.assertEqual(canonical["verificationUrl"], record["verificationUrl"])
        self.assertEqual(len(canonical["discoverySources"]), 2)
        self.assertEqual(changes[0]["change"], "additional-provenance")
        with self.assertRaisesRegex(ValueError, "duplicate"):
            validate_catalogue(original | {"opportunities": [record, record | {"id": "duplicate-record"}]}, sources)

    def test_vanished_round_is_retained_and_can_reappear(self):
        original, _ = refresh(EMPTY, self.one, lambda _: PKF_PAGE, NOW, {})
        record = original["opportunities"][0]
        records = {identity(record, {}): record}
        stale, changes = merge_observations(records, [], self.pkf, self.one, {}, NOW + timedelta(days=1))
        self.assertEqual(changes[0]["change"], "no-longer-listed")
        stale_record, = stale.values()
        self.assertEqual(stale_record["verificationStatus"], "stale")
        self.assertEqual(stale_record["lastVerifiedAt"], record["lastVerifiedAt"])
        candidates = observe(self.pkf, lambda _: PKF_PAGE, NOW)
        recovered, _ = merge_observations(stale, candidates, self.pkf, self.one, {}, NOW + timedelta(days=2))
        self.assertEqual(next(iter(recovered.values()))["verificationStatus"], "verified")


if __name__ == "__main__":
    unittest.main()
