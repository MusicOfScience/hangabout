from copy import deepcopy
from datetime import datetime, timezone
from pathlib import Path
import sys
import unittest
from urllib.error import HTTPError

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "scripts"))
from opportunity_adapters import createability
from refresh_opportunities import REGISTRY, observe, read_json, refresh, validate_record, validate_registry

NOW = datetime(2026, 11, 24, 14, tzinfo=timezone.utc)
EMPTY = {"schemaVersion": 1, "officialUrlAliases": {}, "opportunities": []}
NSW = "https://www.nsw.gov.au/grants-and-funding/2026-27-createability-internship"

NSW_PAGE = """<main><h1>2026-27 Createability Internship</h1><h2>Key information</h2>
<p>Status: Open</p><p>Grant amount: Successful applicants will be employed and paid by the Host Organisation
for up to four weeks (20 days or 160 hours) or eight weeks (40 days or 320 hours).</p>
<p>Application opened: 16 November 2026</p><p>Application closes: 16 December 2026, 2:00 pm</p>
<ul><li>be an individual</li><li>identify as a Deaf or Disabled person</li><li>be over 18 years of age</li>
<li>be residing in NSW over the last 12 months</li><li>have some experience at an emerging or mid-career level</li></ul>
<p>You can answer two questions using video or audio.</p>
<p>You can request SmartyGrants application forms in Microsoft Word format.</p>
<a href="https://artsnsw.smartygrants.com.au/2026-27CI">Apply now</a></main>"""

class StateOpportunityCoverageTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.sources = validate_registry(read_json(REGISTRY))

    def test_index_follows_the_first_party_round_and_keeps_host_pay_separate(self):
        source = self.sources["create-nsw-createability"]
        pages = {
            source["url"]: f'<a href="{NSW}">Apply</a><a href="{NSW}">Guidelines</a>',
            NSW: NSW_PAGE,
        }
        catalogue, report = refresh(EMPTY, {source["id"]: source}, pages.__getitem__, NOW, {}, always=True)
        row, = catalogue["opportunities"]
        self.assertEqual(report["sources"][source["id"]]["observed"], 1)
        self.assertEqual(row["officialUrl"], NSW)
        self.assertEqual(row["discoverySources"][0]["url"], source["url"])
        self.assertEqual(row["funding"]["type"], "paid-placement")
        self.assertIsNone(row["funding"]["maximum"])
        self.assertIsNone(row["funding"]["applicationFee"])
        self.assertTrue(row["eligibility"]["disabilitySpecific"])
        self.assertEqual(row["eligibility"]["states"], ["NSW"])
        self.assertEqual(row["timing"]["closesAt"], "2026-12-16T14:00:00+11:00")
        amended = deepcopy(row)
        amended["funding"].update(maximum=1000, currency="AUD")
        with self.assertRaisesRegex(ValueError, "host employment"):
            validate_record(amended, self.sources)

    def test_http_failure_reports_the_blocked_page(self):
        source = self.sources["create-nsw-createability"]

        def fetch(url):
            if url == source["url"]:
                return f'<a href="{NSW}">Apply</a>'
            raise HTTPError(url, 403, "Forbidden", None, None)

        catalogue, report = refresh(EMPTY, {source["id"]: source}, fetch, NOW, {}, always=True)
        self.assertEqual(catalogue, EMPTY)
        self.assertEqual(report["sources"][source["id"]]["status"], "fetch-failed")
        self.assertEqual(report["sources"][source["id"]]["failedUrl"], NSW)

    def test_unsupported_index_links_cannot_create_a_record(self):
        source = self.sources["create-nsw-createability"]
        offsite = NSW.replace("www.nsw.gov.au", "unverified.example")
        with self.assertRaisesRegex(ValueError, "unexpected number of round pages"):
            observe(source, {source["url"]: f'<a href="{offsite}">Apply</a>'}.__getitem__, NOW)

    def test_nsw_conflicting_closed_status_stops_open_intake(self):
        item, = createability(NSW, NSW_PAGE.replace("Status: Open", "Status: Closed"), NOW)
        self.assertEqual(item["timing"]["observedStatus"], "unknown")
        at_close = datetime(2026, 12, 16, 3, tzinfo=timezone.utc)
        closed, = createability(NSW, NSW_PAGE, at_close)
        self.assertEqual(closed["timing"]["observedStatus"], "closed")

if __name__ == "__main__":
    unittest.main()
