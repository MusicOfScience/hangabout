from copy import deepcopy
from datetime import datetime, timezone
from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "scripts"))
from opportunity_adapters import createability, touring_queensland
from refresh_opportunities import REGISTRY, observe, read_json, refresh, validate_record, validate_registry

NOW = datetime(2026, 11, 24, 14, tzinfo=timezone.utc)
EMPTY = {"schemaVersion": 1, "officialUrlAliases": {}, "opportunities": []}
NSW = "https://www.nsw.gov.au/grants-and-funding/2026-27-createability-internship"
QLD = "https://www.arts.qld.gov.au/funding-opportunities/funding/touring-queensland-fund"

NSW_PAGE = """<main><h1>2026-27 Createability Internship</h1><h2>Key information</h2>
<p>Status: Open</p><p>Grant amount: Successful applicants will be employed and paid by the Host Organisation
for up to four weeks (20 days or 160 hours) or eight weeks (40 days or 320 hours).</p>
<p>Application opened: 16 November 2026</p><p>Application closes: 16 December 2026, 2:00 pm</p>
<ul><li>be an individual</li><li>identify as a Deaf or Disabled person</li><li>be over 18 years of age</li>
<li>be residing in NSW over the last 12 months</li><li>have some experience at an emerging or mid-career level</li></ul>
<p>You can answer two questions using video or audio.</p>
<p>You can request SmartyGrants application forms in Microsoft Word format.</p>
<a href="https://artsnsw.smartygrants.com.au/2026-27CI">Apply now</a></main>"""

QLD_PAGE = """<main><h2>Key dates</h2><p>Round 4<br>Open date: 30 November 2026<br>Close date: 2pm 8 February 2027</p>
<p>Round 3 Closed</p><p>Activity start date: 1 February 2027</p>
<h2>Funding amount</h2><p>Up to $100,000 for a single tour. Applicants can apply for up to 50% of project costs.</p>
<p>Additional funding of up to $10,000 is available to support costs associated with increasing access.</p>
<p>Queensland based individuals, groups and organisations. If you are applying as an individual your primary residence must be in Queensland.
If you are applying as a group or organisation your business address must be in Queensland.</p>
<p>If you are applying as an individual, you must also be:</p>
<ul><li>An Australian citizen or permanent resident</li><li>Aged over 18 years.</li></ul>
<p>Touring itineraries must include at least three (3) locations, excluding the touring party’s home location.</p>
<h3>Apply through SmartyGrants</h3><p>This fund is now closed for applications.</p><h3>Contact</h3>
</main>"""

QLD_FAQ = """<main><p>Applications must not request more than 50% of a tour’s total costs.</p>
<p>In-kind contributions are counted for the purposes of eligibility.</p></main>"""


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

    def test_queensland_publishes_the_next_round_with_local_deadline_and_coinvestment(self):
        row, = touring_queensland(QLD, QLD_PAGE, NOW, QLD_FAQ)
        self.assertEqual(row["timing"]["observedStatus"], "forthcoming")
        self.assertEqual(row["timing"]["closesAt"], "2027-02-08T14:00:00+10:00")
        self.assertIsNone(row["timing"]["commencementDate"])
        self.assertEqual(row["funding"]["maximum"], 100000)
        self.assertEqual(row["funding"]["type"], "partial")
        self.assertIn("50%", row["funding"]["coContribution"])
        self.assertIn("10,000", row["eligibility"]["accessibility"])
        self.assertEqual(row["eligibility"]["states"], ["QLD"])
        self.assertIsNone(row["applicationUrl"])

    def test_queensland_opening_needs_a_current_form(self):
        after_open = datetime(2026, 11, 30, 9, tzinfo=timezone.utc)
        no_form, = touring_queensland(QLD, QLD_PAGE, after_open, QLD_FAQ)
        self.assertEqual(no_form["timing"]["observedStatus"], "unknown")
        form = "https://artsqueensland.smartygrants.com.au/TQFQ4"
        open_page = QLD_PAGE.replace('<p>This fund is now closed for applications.</p>', f'<p><a href="{form}">Apply</a></p>')
        live, = touring_queensland(QLD, open_page, after_open, QLD_FAQ)
        self.assertEqual(live["timing"]["observedStatus"], "open")
        self.assertEqual(live["applicationUrl"], form)
        with self.assertRaisesRegex(ValueError, "50%"):
            touring_queensland(QLD, open_page, after_open, QLD_FAQ.replace("50%", "60%"))


if __name__ == "__main__":
    unittest.main()
