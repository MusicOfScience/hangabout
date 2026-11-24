from datetime import datetime, timezone
from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "scripts"))
from opportunity_adapters import emmanuel
from refresh_opportunities import CATALOGUE, REGISTRY, read_json, refresh, validate_registry


NOW = datetime(2026, 11, 24, 17, tzinfo=timezone.utc)
OVERVIEW = """<main><h1>Emmanuel College Artist-in-Residence Program</h1>
<p>A six-week artists residency in Ceramics, Photography, Printmaking and Social Practice.</p>
<a href="/apply">Apply</a></main>"""
GUIDELINES = """<main><p>Artists must not be currently enrolled in any academic program.</p>
<p>Residency is from June 16th – July 28th, 2027.</p>
<p>Artists will receive a stipend of $1500 dollars.</p>
<p>International artists may be eligible up to an additional $1000 to be used to cover travel and visa costs.</p>
<p>International Artists must obtain a visa to participate. Conversational proficiency of the English language is required.</p>
<p>Lodging is provided, for the individual artist only.</p>
<p>Residents are granted access to a range of shared college studio facilities.</p>
<p>Emmanuel will host an on-campus closing exhibition for all resident artists to participate in.</p>
<p>Artists are responsible for all material, food, shipping, and transportation costs.</p>
<p>Artists will donate one piece to Emmanuel College.</p>
<p>Artists must be on-site for the duration of the program.</p>
<p>The application materials must be submitted via email to ecar@emmanuel.edu as a single PDF (no larger than 10MB).</p>
<p>A Resume or CV An Artist Statement 20 images from a portfolio A Project Proposal.</p>
<p>The 2027 application period is Now Open.</p>
<p>The deadline to apply is December 18th, 2026 11:59PM EST.</p></main>"""


class OpportunityDiscoveryTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.catalogue = read_json(CATALOGUE)
        cls.sources = validate_registry(read_json(REGISTRY))
        cls.directory = cls.sources["on-the-move"]
        cls.funder = cls.sources["emmanuel-college"]

    def check_directory(self, html, previous=None):
        sources = {key: source | {"state": "seed"} for key, source in self.sources.items()}
        sources[self.directory["id"]] = self.directory
        return refresh(self.catalogue, sources, lambda _: html, NOW, previous or {}, True)

    def test_directory_links_are_scoped_deduplicated_and_matched_by_reviewed_provenance(self):
        record = next(record for record in self.catalogue["opportunities"] if record["sourceId"] == "emmanuel-college")
        lead = next(item["url"] for item in record["discoverySources"] if item["sourceId"] == "on-the-move")
        html = f"""<main><a href='/news/navigation'>Navigation</a>
        <a name='residencies'></a><h2 class='nocaps'>Residencies</h2>
        <a href='{lead}'>Emmanuel College</a><a href='{lead}/?tracking=abc#details'>Duplicate</a>
        <a href='/news/unreviewed'>Unreviewed</a><a href='https://other.example/news/alien'>External</a>
        <a name='jobs'></a><h2>Jobs</h2><a href='/news/jobs'>Jobs</a></main>"""
        catalogue, report = self.check_directory(html)
        self.assertEqual(catalogue, self.catalogue)
        self.assertEqual(report["changes"], [])
        self.assertEqual(report["sources"]["on-the-move"]["observed"], 2)
        self.assertEqual(report["discoveryLeads"], [
            {"sourceId": "on-the-move", "url": lead, "catalogueIds": [record["id"]]},
            {"sourceId": "on-the-move", "url": "https://on-the-move.org/news/unreviewed", "catalogueIds": []},
        ])

    def test_empty_directory_keeps_catalogue_and_success_timestamp(self):
        previous = "2026-11-19T00:00:00+00:00"
        catalogue, report = self.check_directory(
            "<main><a name='residencies'></a><h2>Residencies</h2></main>", {"on-the-move": previous},
        )
        self.assertEqual(catalogue, self.catalogue)
        self.assertEqual(report["discoveryLeads"], [])
        self.assertEqual(report["sources"]["on-the-move"]["status"], "quarantined")
        self.assertEqual(report["sources"]["on-the-move"]["lastSuccessfulFetchAt"], previous)

    def test_emmanuel_matches_official_deadline_and_keeps_support_separate_from_costs(self):
        record, = emmanuel(self.funder["url"], OVERVIEW, NOW, GUIDELINES)
        self.assertEqual(record["applicationUrl"], self.funder["supportingUrl"])
        self.assertEqual(record["timing"]["closesAt"], "2026-12-18T23:59:00-05:00")
        self.assertEqual(record["timing"]["observedStatus"], "open")
        self.assertEqual(record["eligibility"]["scope"], "international")
        funding = record["funding"]
        self.assertEqual((funding["maximum"], funding["currency"]), (1500, "USD"))
        self.assertIn("USD 1,000", funding["travel"])
        self.assertIn("shipping", funding["otherCosts"])
        self.assertFalse(funding["fullyFunded"])
        self.assertIsNone(funding["applicationFee"])
        self.assertIsNone(funding["participationFee"])

        expired, = emmanuel(self.funder["url"], OVERVIEW, datetime(2026, 12, 19, 4, 59, tzinfo=timezone.utc), GUIDELINES)
        self.assertEqual(expired["timing"]["observedStatus"], "closed")
        with self.assertRaisesRegex(ValueError, "conflicts with its timezone"):
            emmanuel(self.funder["url"], OVERVIEW, NOW, GUIDELINES.replace("EST", "EDT"))
