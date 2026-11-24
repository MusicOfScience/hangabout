from datetime import datetime, timezone
from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "scripts"))
from opportunity_adapters import gottlieb_emergency, gottlieb_individual, ramsay
from refresh_opportunities import REGISTRY, observe, read_json, refresh, validate_registry

NOW = datetime(2026, 11, 24, 14, tzinfo=timezone.utc)
EMPTY = {"schemaVersion": 1, "officialUrlAliases": {}, "opportunities": []}
AGSA = "https://www.agsa.sa.gov.au/whats-on/ramsay-art-prize/"
TERMS = AGSA + "ramsay-art-prize-2027-terms-and-conditions/"
GOTTLIEB = "https://www.gottliebfoundation.org/"
FORM_ID = "12345678-1234-abcd-9876-123456789abc"

PRIZE = f"""<main><h1>Ramsay Art Prize</h1>
<p>A $100,000 art prize for contemporary artists working in any medium.</p>
<p>Entries for the Ramsay Art Prize 2027 open on 11 September and close 11 December 2026 at 5pm.</p>
<p>An administration fee of $50 (inc. GST) is applicable.</p>
<p>Duos or art collectives are eligible to enter.</p>
<a href="{TERMS}">Terms and Conditions</a>
<a href="https://forms.sa.gov.au/form/6940cd41ec2338329cb7be0e">Enter</a></main>"""

PRIZE_TERMS = """<main><h1>Ramsay Art Prize 2027 - Terms &amp; Conditions</h1>
<p>Submissions to the Ramsay Art Prize 2027 must be uploaded to the gallery website
between the hours of 10.00am, 11 September and 5.00pm, 11 December 2026 (Adelaide, South Australia, local time).</p>
<p>The entrant must be under the age of 40 and over the age of 18.</p>
<p>Entrants must be Australian citizens or permanent residents and must be living in Australia as their primary place of residence.</p>
<p>Submissions are limited to one entry per person or collective.</p>
<p>The submitted entry must be new or recent work. The entry must be original.</p>
<p>The work of art submitted must be unique and non-editioned.</p>
<p>Entry into the Ramsay Art Prize will incur a $50 administration fee, including GST.</p>
<p>Full ownership of the submitted entry (but not copyright) will be transferred.</p>
<p>Entrants grant a perpetual, royalty-free, non-exclusive licence.</p>
<p>The winner must obtain independent legal advice, at their own cost.</p>
<p>The gallery will pay the Ramsay Art Prize 2027 winner $100,000 (GST exclusive).</p></main>"""

EMERGENCY = f"""<main><h1>Emergency Grant</h1>
<p>Aid after an unforeseen, catastrophic incident. This program has no deadlines.</p>
<p>The maximum amount of this grant is $15,000.</p>
<p>Eligibility requires a minimum involvement of ten years in a mature phase of work.
Artists must work in the disciplines of painting, sculpture or printmaking.</p>
<p>The funder cannot process further applications once this budgetary limit has been reached.</p>
<p>The programme does not consider requests for dental work, chronic situations, capital improvements, or projects,
general indebtedness or lack of employment.</p>
<a href="https://gottliebfoundation.submittable.com/submit/{FORM_ID}/emergency-grant-application">Apply</a></main>"""

FAQ = """<main><p>The Foundation’s grant programs are open to both US-based and international artists.
US citizenship or residency is not required.</p>
<p>Apply before midnight Eastern Standard Time on January 15, 2027.</p>
<p>International applicants must provide a complete tax return.</p>
<p>Submitted images must begin in 2007 or earlier and cover the years between then and now.</p></main>"""

INDIVIDUAL = f"""<main><p>Applications for the 2027 grant cycle will be accepted beginning October 15, 2026.
The deadline to apply is January 15, 2027 at 11:59 Eastern Time.</p>
<p>Last year, the Foundation awarded grants of $25,000 each to 20 artists.</p>
<p>For painters, sculptors, and printmakers who have worked in a mature phase of art for 20 years or more.</p>
<p>Eligibility for an Individual Support Grant is determined by the applicant’s current financial need.</p>
<a href="https://gottliebfoundation.submittable.com/submit/{FORM_ID}/view">Apply</a></main>"""


class OpportunityCoverageTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.sources = validate_registry(read_json(REGISTRY))

    def test_prize_confirms_fee_and_adelaide_offsets(self):
        source = self.sources["agsa-ramsay"]
        row, = observe(source, {AGSA: PRIZE, TERMS: PRIZE_TERMS}.__getitem__, NOW)
        self.assertEqual(row["supportingEvidenceUrl"], TERMS)
        self.assertEqual(row["categories"], ["prize-award"])
        self.assertEqual(row["funding"]["minimum"], 100000)
        self.assertEqual(row["funding"]["maximum"], 100000)
        self.assertEqual(row["funding"]["applicationFee"], {"amount": 50, "currency": "AUD"})
        self.assertIsNone(row["funding"]["participationFee"])
        self.assertEqual(row["timing"]["opensAt"], "2026-09-11T10:00:00+09:30")
        self.assertEqual(row["timing"]["closesAt"], "2026-12-11T17:00:00+10:30")
        at_close = datetime(2026, 12, 11, 6, 30, tzinfo=timezone.utc)
        closed, = ramsay(AGSA, PRIZE, at_close, PRIZE_TERMS)
        self.assertEqual(closed["timing"]["observedStatus"], "closed")

    def test_conflicting_prize_terms_keep_the_previous_verified_fee(self):
        source = {"agsa-ramsay": self.sources["agsa-ramsay"]}
        pages = {AGSA: PRIZE, TERMS: PRIZE_TERMS}
        original, _ = refresh(EMPTY, source, pages.__getitem__, NOW, {}, always=True)
        pages[TERMS] = PRIZE_TERMS.replace("$50", "$75")
        next_check = datetime(2026, 11, 25, 14, tzinfo=timezone.utc)
        candidate, report = refresh(original, source, pages.__getitem__, next_check, {}, always=True)
        self.assertEqual(candidate, original)
        self.assertEqual(report["sources"]["agsa-ramsay"]["status"], "quarantined")
        self.assertIn("disagree on amounts", report["sources"]["agsa-ramsay"]["detail"])

    def test_offsite_terms_link_is_quarantined_before_fetching(self):
        source = self.sources["agsa-ramsay"]
        offsite = PRIZE.replace(TERMS, TERMS.replace("www.agsa.sa.gov.au", "unverified.example"))
        with self.assertRaisesRegex(ValueError, "first-party link"):
            observe(source, {AGSA: offsite}.__getitem__, NOW)

    def test_emergency_requires_an_international_eligibility_source(self):
        row, = gottlieb_emergency(GOTTLIEB + "emergency-grant", EMERGENCY, NOW, FAQ)
        self.assertIn("emergency-assistance", row["categories"])
        self.assertEqual(row["funding"]["maximum"], 15000)
        self.assertEqual(row["funding"]["currency"], "USD")
        self.assertEqual(row["eligibility"]["scope"], "international")
        self.assertTrue(row["timing"]["rolling"])
        self.assertEqual(row["timing"]["observedStatus"], "open")
        with self.assertRaisesRegex(ValueError, "eligibility|international"):
            gottlieb_emergency(GOTTLIEB + "emergency-grant", EMERGENCY, NOW, "<main>Other FAQ</main>")

    def test_individual_uses_eastern_time_and_leaves_historical_amount_unpublished(self):
        row, = gottlieb_individual(GOTTLIEB + "individual-support-grant-1", INDIVIDUAL, NOW, FAQ)
        self.assertEqual(row["timing"]["closesAt"], "2027-01-15T23:59:00-05:00")
        self.assertEqual(row["timing"]["deadlineTimezone"], "America/New_York")
        self.assertEqual(row["timing"]["observedStatus"], "open")
        self.assertIsNone(row["funding"]["maximum"])
        with self.assertRaisesRegex(ValueError, "before midnight"):
            gottlieb_individual(GOTTLIEB + "individual-support-grant-1", INDIVIDUAL, NOW, FAQ.replace("January 15", "January 16"))


if __name__ == "__main__":
    unittest.main()
