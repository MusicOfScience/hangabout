from datetime import datetime, timezone
from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "scripts"))
from opportunity_adapters import ARTSACT_PORTAL, artsact_cultural
from refresh_opportunities import REGISTRY, observe, read_json, refresh, validate_registry


NOW = datetime(2026, 11, 25, 0, tzinfo=timezone.utc)
ROUND = ARTSACT_PORTAL + "culturalartsprogram2027"
EMPTY = {"schemaVersion": 1, "officialUrlAliases": {}, "opportunities": []}
GUIDELINES = f"""<main><h2>Cultural Arts Program Objective</h2>
<p>Projects are led by and for the Aboriginal and Torres Strait Islander artists and communities of the capital region.</p>
<p>Activities are initiated and led by an Aboriginal and Torres Strait Islander individual, group or organisation.</p>
<p>Disciplines include dance, music, theatre, visual arts and crafts, literature, digital and new media, screen and arts-based festivals.</p>
<p>Funding amounts will be between $3,000 and $15,000 per project.</p>
<p>Stage 1: EOI submitted through SmartyGrants. Stage 2: Final application including detailed budget.</p>
<ul><li>Expressions of Interest (EOI) opens Friday 2 October 2026</li>
<li>EOI submissions close 12:00pm Wednesday 2 December 2026</li>
<li>Shortlisted applicants invited to submit full applications Friday 22 January 2027</li>
<li>Shortlisted applicants submit full application 12:00pm Friday 5 March 2027</li></ul>
<p>Please contact us to discuss any accessibility requirements.</p><a href="{ARTSACT_PORTAL}">Grants portal</a>
</main>"""
PORTAL = f"""<main><h3><a href="{ROUND}">2027 Aboriginal and Torres Strait Islander Cultural Arts Program</a></h3>
<p>Submissions are now open.</p><p>Submissions close 12:00pm 2 December 2026 (AEDT).</p></main>"""


class ArtsACTOpportunityTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.source = validate_registry(read_json(REGISTRY))["artsact-cultural-arts"]
        cls.sources = {cls.source["id"]: cls.source}

    def test_uses_first_stage_cutoff_and_funder_linked_portal(self):
        calls = []
        pages = {self.source["url"]: GUIDELINES, ARTSACT_PORTAL: PORTAL}

        def fetch(url):
            calls.append(url)
            return pages[url]

        record, = observe(self.source, fetch, NOW)
        self.assertEqual(calls, [self.source["url"], ARTSACT_PORTAL])
        self.assertEqual(record["officialUrl"], self.source["url"])
        self.assertEqual(record["applicationUrl"], ROUND)
        self.assertEqual(record["roundKey"], "2027")
        self.assertEqual(record["timing"]["closesAt"], "2026-12-02T12:00:00+11:00")
        self.assertEqual(record["timing"]["observedStatus"], "open")
        self.assertEqual(record["eligibility"]["states"], ["ACT"])
        funding = record["funding"]
        self.assertEqual((funding["minimum"], funding["maximum"], funding["currency"]), (3000, 15000, "AUD"))
        self.assertIsNone(funding["applicationFee"])

    def test_portal_removal_does_not_infer_open_status(self):
        portal = "<main><p>Other rounds</p></main>"
        record, = artsact_cultural(self.source["url"], GUIDELINES, NOW, portal)
        self.assertIsNone(record["applicationUrl"])
        self.assertEqual(record["timing"]["observedStatus"], "unknown")
        cutoff = datetime(2026, 12, 2, 1, tzinfo=timezone.utc)
        closed, = artsact_cultural(self.source["url"], GUIDELINES, cutoff, portal)
        self.assertEqual(closed["timing"]["observedStatus"], "closed")

    def test_conflicting_cutoff_preserves_validated_record(self):
        pages = {self.source["url"]: GUIDELINES, ARTSACT_PORTAL: PORTAL}
        catalogue, _ = refresh(EMPTY, self.sources, pages.__getitem__, NOW, {}, always=True)
        pages[ARTSACT_PORTAL] = PORTAL.replace("12:00pm", "1:00pm")
        candidate, report = refresh(catalogue, self.sources, pages.__getitem__, NOW, {}, always=True)
        self.assertEqual(candidate, catalogue)
        self.assertEqual(report["changes"], [])
        self.assertEqual(report["sources"][self.source["id"]]["status"], "quarantined")
