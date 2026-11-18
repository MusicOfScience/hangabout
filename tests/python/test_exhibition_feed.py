import json
import sys
import unittest
from copy import deepcopy
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "scripts"))
from refresh_exhibition_feed import INDEX, apply_feed


def tile(native_id=8101, **changes):
    return {
        "id": native_id, "t1": "Ken Whisson and John Foubister", "t2": "Going Back In",
        "tp": "exhibition", "ds": None, "url": "/exhibitions/going-back-in/",
        "st": "2026-08-22T10:00:00+10:00", "nd": "2026-11-22T17:00:00+11:00",
        **changes,
    }


def page(current, upcoming=()):
    payload = {"props": {"pageProps": {"postTileData": {"current": current, "upcoming": upcoming}}}}
    return '<script id="__NEXT_DATA__" type="application/json">' + json.dumps(payload) + '</script>'


class ExhibitionFeedTest(unittest.TestCase):
    def setUp(self):
        self.existing = {
            "id": "heide-whisson-foubister-going-back-in-2026",
            "venueId": "heide-museum-modern-art", "title": "Going Back In",
            "artists": ["Ken Whisson", "John Foubister"], "sourceType": "official",
            "sourceUrl": INDEX, "startDate": "2026-08-22", "endDate": "2026-11-22",
            "lastVerified": "2026-11-17",
        }
        self.new = tile(8142, t1="Personal Effects", t2="", url="/exhibitions/personal-effects/")

    def test_current_and_upcoming_add_and_correct_in_place(self):
        records = [self.existing]
        later = dict(self.new, st="2026-11-20T22:00:00Z")
        html = page([tile(nd="2026-11-23T17:00:00+11:00")], [later])
        result = apply_feed(records, [], html, "2026-11-18")
        self.assertEqual([row["status"] for row in result], ["updated", "added"])
        self.assertEqual(self.existing["endDate"], "2026-11-23")
        self.assertEqual(self.existing["artists"], ["Ken Whisson", "John Foubister"])
        self.assertEqual(records[1]["id"], "heide-feed-8142")
        self.assertEqual(records[1]["startDate"], "2026-11-21")
        self.assertEqual([r["status"] for r in apply_feed(records, [], html, "2026-11-18")],
                         ["unchanged", "unchanged"])

    def test_failed_and_missing_entries_keep_last_good_data(self):
        records = [self.existing]
        previous = deepcopy(records)
        with self.assertRaises(ValueError):
            apply_feed(records, [], "<html>temporary error</html>", "2026-11-18")
        self.assertEqual(records, previous)
        result = apply_feed(records, [], page([self.new]), "2026-11-18")
        self.assertEqual(result[-1]["status"], "review-missing-from-index")
        self.assertEqual(records[0], previous[0])

    def test_ambiguous_records_and_existing_matches_are_held(self):
        records = [self.existing]
        previous = deepcopy(records)
        result = apply_feed(records, [{"id": "legacy", **{k: v for k, v in self.existing.items() if k != "id"},
                                       "title": "Personal Effects"}],
                            page([tile(t2="Different show"), self.new]), "2026-11-18")
        self.assertEqual([row["status"] for row in result],
                         ["review-identity-change", "review-existing-match"])
        self.assertEqual(records, previous)

    def test_duplicate_urls_never_publish_and_ended_shows_stay_historical(self):
        records = []
        result = apply_feed(records, [], page([self.new, dict(self.new, id=8143)]), "2026-11-18")
        self.assertEqual([row["status"] for row in result], ["review-invalid-tile"] * 2)
        result = apply_feed(records, [], page([self.new]), "2026-11-23")
        self.assertEqual(result[0]["status"], "ended")
        self.assertFalse(records)
