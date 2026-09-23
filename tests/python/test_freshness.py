"""Offline regression coverage for release blocking and its review report."""
import unittest
from datetime import date
from scripts.validate_freshness import check


class FreshnessReportTests(unittest.TestCase):
    def test_report_preserves_evidence_and_excludes_expired_events(self):
        rows = [
            {"id": "stale", "title": "Fixture show", "endDate": "2026-10-01",
             "lastVerified": "2026-08-19", "sourceUrl": "https://example.org/show"},
            {"id": "expired", "endDate": "2026-09-01", "lastVerified": "2026-08-19"},
            {"id": "boundary", "endDate": "2026-10-01", "lastVerified": "2026-09-09"},
        ]
        queue = []
        failures = check(rows, "event", 14, date(2026, 9, 23), active_only=True, queue=queue)
        self.assertEqual(len(failures), 1)
        self.assertEqual([row["id"] for row in queue], ["stale"])
        self.assertEqual(queue[0]["sourceUrl"], "https://example.org/show")
        self.assertEqual(queue[0]["ageDays"], 35)
        self.assertEqual(rows[0]["lastVerified"], "2026-08-19")

    def test_studio_report_uses_website_without_changing_failure(self):
        rows = [{"id": "studio", "name": "Fixture studio", "lastVerified": "2026-09-01",
                 "website": "https://example.org/studio"}]
        queue = []
        failures = check(rows, "studio", 14, date(2026, 9, 23), queue=queue)
        self.assertTrue(failures)
        self.assertEqual(queue[0]["sourceUrl"], "https://example.org/studio")
        self.assertEqual(check(rows, "studio", 14, date(2026, 9, 23)), failures)


if __name__ == "__main__":
    unittest.main()
