from datetime import datetime, timezone
from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "scripts"))
from opportunity_adapters import ARTSACT_CULTURAL_GUIDELINES, ARTSACT_CULTURAL_ROUND, artsact_cultural
from refresh_opportunities import REGISTRY, observe, read_json, refresh, validate_registry


NOW = datetime(2026, 11, 25, 0, tzinfo=timezone.utc)
EMPTY = {"schemaVersion": 1, "officialUrlAliases": {}, "opportunities": []}
ANNOUNCEMENT = f"""<main><p>Aboriginal and Torres Strait Islander artists, groups and organisations can now apply.</p>
<p>The program offers grants of between $3,000 and $15,000 across a range of artforms, including visual arts, music,
theatre, dance, literature, screen, digital media and festivals.</p>
<p>The program builds creativity with the Canberra community. Expressions of interest are now open.</p>
<a href="{ARTSACT_CULTURAL_GUIDELINES}">artsACT website</a></main>"""
PORTAL = """<main><h1>2027 Aboriginal and Torres Strait Islander Cultural Arts Program</h1>
<p>Submissions are now being accepted. Submissions close at 12:00pm 2 December 2026 (AEDT).</p></main>"""


class ArtsACTOpportunityTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.source = validate_registry(read_json(REGISTRY))["artsact-cultural-arts"]
        cls.sources = {cls.source["id"]: cls.source}

    def test_uses_reviewed_round_cutoff_and_preserves_unconfirmed_opening(self):
        calls = []
        pages = {self.source["url"]: ANNOUNCEMENT, ARTSACT_CULTURAL_ROUND: PORTAL}

        def fetch(url):
            calls.append(url)
            return pages[url]

        record, = observe(self.source, fetch, NOW)
        self.assertEqual(calls, [self.source["url"], ARTSACT_CULTURAL_ROUND])
        self.assertEqual(record["officialUrl"], self.source["url"])
        self.assertEqual(record["applicationUrl"], ARTSACT_CULTURAL_ROUND)
        self.assertEqual(record["roundKey"], "2027")
        self.assertEqual(record["timing"]["closesAt"], "2026-12-02T12:00:00+11:00")
        self.assertEqual(record["timing"]["observedStatus"], "open")
        self.assertIsNone(record["timing"]["openingDate"])
        self.assertEqual(record["eligibility"]["states"], ["ACT"])
        funding = record["funding"]
        self.assertEqual((funding["minimum"], funding["maximum"], funding["currency"]), (3000, 15000, "AUD"))
        self.assertIsNone(funding["applicationFee"])

    def test_intake_without_portal_confirmation_and_expiry(self):
        portal = PORTAL.replace("Submissions are now being accepted.", "")
        record, = artsact_cultural(self.source["url"], ANNOUNCEMENT, NOW, portal)
        self.assertEqual(record["timing"]["observedStatus"], "unknown")
        cutoff = datetime(2026, 12, 2, 1, tzinfo=timezone.utc)
        closed, = artsact_cultural(self.source["url"], ANNOUNCEMENT, cutoff, PORTAL)
        self.assertEqual(closed["timing"]["observedStatus"], "closed")

    def test_conflicting_cutoff_preserves_validated_record(self):
        pages = {self.source["url"]: ANNOUNCEMENT, ARTSACT_CULTURAL_ROUND: PORTAL}
        catalogue, _ = refresh(EMPTY, self.sources, pages.__getitem__, NOW, {}, always=True)
        pages[ARTSACT_CULTURAL_ROUND] = PORTAL.replace("AEDT", "AEST")
        candidate, report = refresh(catalogue, self.sources, pages.__getitem__, NOW, {}, always=True)
        self.assertEqual(candidate, catalogue)
        self.assertEqual(report["changes"], [])
        self.assertEqual(report["sources"][self.source["id"]]["status"], "quarantined")

    def test_announcement_missing_expected_programme_link_stops_portal_fetch(self):
        pages = {self.source["url"]: ANNOUNCEMENT.replace(ARTSACT_CULTURAL_GUIDELINES, "https://example.org/")}
        with self.assertRaisesRegex(ValueError, "no longer points to the reviewed artsACT programme"):
            observe(self.source, pages.__getitem__, NOW)
