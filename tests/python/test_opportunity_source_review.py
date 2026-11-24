import json
from pathlib import Path
import subprocess
import sys
from tempfile import TemporaryDirectory
import unittest


SCRIPT = Path(__file__).resolve().parents[2] / "scripts" / "check_opportunity_source_report.py"


def source(source_id, state="active", url="https://example.org/opportunities"):
    return {"id": source_id, "state": state, "url": url}


class OpportunitySourceReviewTest(unittest.TestCase):
    def run_review(self, base, proposed, results):
        with TemporaryDirectory() as folder:
            paths = [Path(folder) / name for name in ("base.json", "proposed.json", "report.json")]
            for path, payload in zip(paths, ({"sources": base}, {"sources": proposed}, {"sources": results})):
                path.write_text(json.dumps(payload), encoding="utf-8")
            return subprocess.run([sys.executable, SCRIPT, *paths], capture_output=True, text=True)

    def test_new_source_failure_fails_even_when_another_source_succeeds(self):
        existing = source("established")
        for state in ("active", "discovery"):
            with self.subTest(state=state):
                result = self.run_review([existing], [existing, source("new", state)], {
                    "established": {"status": "ok"},
                    "new": {"status": "fetch-failed"},
                })
                self.assertEqual(result.returncode, 1, result.stderr)
                self.assertIn("new: fetch-failed", result.stdout)

    def test_unchanged_failure_and_paused_source_do_not_block_another_activation(self):
        existing = source("established")
        result = self.run_review(
            [existing, source("new", "seed"), source("paused")],
            [existing, source("new"), source("paused", "seed")],
            {"established": {"status": "fetch-failed"}, "new": {"status": "ok"}},
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(result.stdout.strip(), "new: ok")

    def test_edited_active_source_requires_a_successful_report(self):
        for status in ("quarantined", "not-due", None):
            with self.subTest(status=status):
                result = self.run_review(
                    [source("edited")],
                    [source("edited", url="https://example.org/new-page"), source("lead", "seed")],
                    {"edited": {"status": status}} if status else {},
                )
                self.assertEqual(result.returncode, 1, result.stderr)
                self.assertIn(f"edited: {status or 'missing from report'}", result.stdout)
