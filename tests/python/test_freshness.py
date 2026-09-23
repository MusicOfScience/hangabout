"""Offline regression coverage for freshness warnings and their review report."""
import unittest
from datetime import date
import subprocess
import sys
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

    def test_freshness_audit_is_warning_by_default_and_strict_when_requested(self):
        row = {"id": "studio", "name": "Fixture studio", "lastVerified": "2026-09-01",
               "website": "https://example.org/studio"}
        queue = []
        self.assertTrue(check([row], "studio", 14, date(2026, 9, 23), queue=queue))
        self.assertEqual(queue[0]["ageDays"], 22)

    def test_cli_warning_is_non_blocking_but_strict_mode_fails(self):
        report = "/private/tmp/hangabout-test-freshness-report.json"
        normal = subprocess.run(
            [sys.executable, "scripts/validate_freshness.py", "--report", report],
            capture_output=True, text=True,
        )
        strict = subprocess.run(
            [sys.executable, "scripts/validate_freshness.py", "--strict"],
            capture_output=True, text=True,
        )
        self.assertEqual(normal.returncode, 0)
        self.assertNotEqual(strict.returncode, 0)
        self.assertIn("freshness warning", normal.stdout)


if __name__ == "__main__":
    unittest.main()
