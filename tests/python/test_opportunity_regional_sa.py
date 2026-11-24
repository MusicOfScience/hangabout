from datetime import datetime, timezone
from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "scripts"))
from opportunity_adapters import country_arts_sa_project
from refresh_opportunities import REGISTRY, observe, read_json, validate_registry


NOW = datetime(2026, 11, 25, 0, tzinfo=timezone.utc)
GUIDELINES = """<main><h1>Project Grants | Round 1 | 2027</h1>
<p>The next Regional Arts Fund Project Grant round will open 1 February 2027 and close 15 March 2027 for activities commencing no earlier than 1 July 2027.</p>
<p>Applicant types: an individual over 18; an Australian incorporated organisation that can provide evidence of non-profit status; or a local government organisation.</p>
<ul><li>be based in regional or remote South Australia</li>
<li>have an active Australian Business Number (ABN) that is registered to your name and location</li>
<li>not have any outstanding reports, acquittals or serious breaches relating to any Australian Government funding</li></ul>
<p>You can apply for Project Grants of up to $30,000. There is no minimum grant amount.</p>
<p>Supports any area of creative practice, multiple artforms or cross-disciplinary practice.</p>
<ul><li>Travel costs (including international)</li><li>Materials</li><li>Disability access costs</li></ul>
<p>Applications are assessed on a competitive basis. All applications must include realistic budgets and represent value with money.</p>
<p>Apply online via Smarty Grants.</p><a href="https://regionalarts.smartygrants.com.au/">Apply Now</a></main>"""


class RegionalSouthAustraliaOpportunityTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.source = validate_registry(read_json(REGISTRY))["country-arts-sa-project"]

    def test_announced_round_keeps_date_and_fee_uncertainties(self):
        record, = observe(self.source, lambda _: GUIDELINES, NOW)
        self.assertEqual(record["roundKey"], "2027-round-1")
        self.assertEqual(record["timing"]["observedStatus"], "forthcoming")
        self.assertEqual(record["timing"]["openingDate"], "2027-02-01")
        self.assertEqual(record["timing"]["closingDate"], "2027-03-15")
        self.assertEqual(record["timing"]["commencementDate"], "2027-07-01")
        self.assertEqual(record["timing"]["deadlineTimezone"], "Australia/Adelaide")
        self.assertIsNone(record["timing"]["closesAt"])
        self.assertIsNone(record["applicationUrl"])
        self.assertEqual(record["eligibility"]["states"], ["SA"])
        self.assertEqual(record["eligibility"]["geography"], "Regional or remote South Australia")
        funding = record["funding"]
        self.assertIsNone(funding["minimum"])
        self.assertEqual((funding["maximum"], funding["currency"]), (30000, "AUD"))
        self.assertIsNone(funding["applicationFee"])

    def test_calendar_boundaries_never_treat_generic_portal_as_open_intake(self):
        for time, expected in (
            (datetime(2027, 1, 31, 13, 29, tzinfo=timezone.utc), "forthcoming"),
            (datetime(2027, 1, 31, 13, 30, tzinfo=timezone.utc), "unknown"),
            (datetime(2027, 3, 15, 13, 29, tzinfo=timezone.utc), "unknown"),
            (datetime(2027, 3, 15, 13, 30, tzinfo=timezone.utc), "closed"),
        ):
            with self.subTest(time=time):
                record, = country_arts_sa_project(self.source["url"], GUIDELINES, time)
                self.assertEqual(record["timing"]["observedStatus"], expected)

    def test_contradictory_year_is_quarantined(self):
        with self.assertRaisesRegex(ValueError, "round and dates are inconsistent"):
            observe(self.source, lambda _: GUIDELINES.replace("Round 1 | 2027", "Round 1 | 2026"), NOW)
