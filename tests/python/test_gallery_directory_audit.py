import unittest
from datetime import date
from pathlib import Path
import sys
from unittest.mock import patch

with patch.object(sys, "path", [str(Path(__file__).resolve().parents[2] / "scripts"), *sys.path]):
    from audit_gallery_directory import build_report, summary


class GalleryDirectoryAuditTests(unittest.TestCase):
    def test_comparison_keeps_shared_websites_and_missing_sources_in_review(self):
        venues = {
            "gallery": {"id": "gallery", "name": "Gallery", "website": "https://gallery.test/",
                        "wikidataId": "Q1", "lastVerified": "2026-08-01"},
            "branch-one": {"id": "branch-one", "name": "Branch One", "website": "https://branches.test/",
                           "lastVerified": "2026-11-23"},
            "branch-two": {"id": "branch-two", "name": "Branch Two", "website": "https://branches.test/",
                           "lastVerified": "2026-11-23"},
        }
        candidates = [
            {"id": "Q1", "name": "Gallery", "websiteCandidates": ["https://different.test/"]},
            {"id": "Q2", "name": "Branch One", "websiteCandidates": ["http://www.branches.test"]},
            {"id": "Q3", "name": "Cached Gallery", "websiteCandidates": []},
            {"id": "Q4", "name": "New Gallery", "websiteCandidates": []},
        ]
        cache = [{"id": "cached-gallery", "name": "Cached Gallery"}]
        report = build_report(venues, cache, {"candidates": candidates, "truncated": True}, None, date(2026, 11, 23))

        reviewed, shared, cached, unmatched = report["wikidata"]["candidates"]
        self.assertEqual(reviewed["matchedVenueId"], "gallery")
        self.assertTrue(reviewed["websiteNeedsReview"])
        self.assertEqual(shared["status"], "ambiguous")
        self.assertIsNone(shared["matchedVenueId"])
        self.assertEqual(cached["discoveryCacheNameMatches"], ["cached-gallery"])
        self.assertEqual(cached["status"], "possible-cache-match")
        self.assertEqual(unmatched["status"], "unmatched")
        self.assertEqual([row["id"] for row in report["overdueVenues"]], ["gallery"])
        self.assertEqual(report["programmeDiscovery"]["status"], "unavailable")
        self.assertIn("hit its query limit", summary(report))

    def test_partial_discovery_preserves_programme_failures_and_zero_results(self):
        discovery = {"sources": [
            {"venueId": "denied", "status": "skipped-robots"},
            {"venueId": "empty", "status": "ok", "count": 0},
            {"venueId": "working", "status": "ok", "count": 5},
        ]}
        report = build_report({}, [], None, discovery, date(2026, 11, 23))
        self.assertEqual(report["wikidata"]["status"], "unavailable")
        self.assertEqual([row["venueId"] for row in report["programmeDiscovery"]["issues"]], ["denied", "empty"])
        self.assertIn("Wikidata results were unavailable", summary(report))
