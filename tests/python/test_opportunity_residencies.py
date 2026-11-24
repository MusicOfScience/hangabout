from datetime import datetime, timezone
from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "scripts"))
from opportunity_adapters import down_the_lane
from refresh_opportunities import REGISTRY, observe, read_json, validate_registry

CULTURE_INDEX = "https://www.culturefocus.com.au/"
CULTURE = CULTURE_INDEX + "down-the-lane-residency-2027"
NOW = datetime(2026, 11, 24, 15, tzinfo=timezone.utc)

CULTURE_PAGE = """<main><h1>Down the Lane Artist Residency 2027</h1>
<p>APPLICATIONS OPEN 1 OCTOBER 2026</p><a href="/new-page-2">Apply Now</a>
<p>All applications must be submitted by 20 December 2026.</p>
<p>The residency is open to practising artists worldwide, at any career stage, working in any medium.
Applicants must be present in the studio for the full month in March 2027.</p>
<p>Support covers return airfare, your accommodation for the month, a private studio and a separate workshop area,
along with an A$500 production budget. The A$50 application fee is non-refundable.</p></main>"""


class OpportunityResidenciesTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.sources = validate_registry(read_json(REGISTRY))

    def test_culture_index_only_accepts_official_round_pages(self):
        index = (f'<a href="{CULTURE}">Residency</a><a href="{CULTURE}">Current round</a>'
                 '<a href="https://other.example/down-the-lane-residency-2028">Unverified</a>')
        source = self.sources["culture-focus-down-the-lane"]
        record, = observe(source, {CULTURE_INDEX: index, CULTURE: CULTURE_PAGE}.__getitem__, NOW)
        self.assertEqual(record["officialUrl"], CULTURE)

    def test_date_only_deadline_stays_date_only(self):
        record, = down_the_lane(CULTURE, CULTURE_PAGE, NOW)
        self.assertEqual(record["timing"]["closingDate"], "2026-12-20")
        self.assertIsNone(record["timing"]["closesAt"])
        self.assertEqual(record["timing"]["deadlineTimezone"], "Australia/Melbourne")
        on_the_day, = down_the_lane(CULTURE, CULTURE_PAGE, datetime(2026, 12, 19, 13, tzinfo=timezone.utc))
        self.assertEqual(on_the_day["timing"]["observedStatus"], "unknown")
        expired, = down_the_lane(CULTURE, CULTURE_PAGE, datetime(2026, 12, 20, 13, tzinfo=timezone.utc))
        self.assertEqual(expired["timing"]["observedStatus"], "closed")

    def test_culture_support_and_application_fee_remain_independent(self):
        record, = down_the_lane(CULTURE, CULTURE_PAGE, NOW)
        funding = record["funding"]
        self.assertEqual(funding["minimum"], funding["maximum"])
        self.assertEqual(funding["maximum"], 500)
        self.assertEqual(funding["applicationFee"], {"amount": 50, "currency": "AUD"})
        self.assertIsNone(funding["participationFee"])
        self.assertEqual(funding["type"], "partial")
        self.assertEqual(record["eligibility"]["scope"], "international")


if __name__ == "__main__":
    unittest.main()
