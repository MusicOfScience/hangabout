import unittest

from scripts.reverify_programme import needs_verification, normalise_text, page_contains_title, reverify


class ProgrammeReverifyTests(unittest.TestCase):
    def test_normalisation_handles_punctuation_and_accents(self):
        self.assertEqual(normalise_text("Amélie Smith — Look Closer"), "amelie smith look closer")

    def test_title_presence_is_punctuation_insensitive(self):
        self.assertTrue(page_contains_title("Current exhibition: THE LETTING GO (2012–2026)", "THE LETTING GO (2012-2026)"))

    def test_changed_source_dates_preserve_previous_verification(self):
        event = {"id": "show", "title": "The Blue Highway", "sourceType": "official",
                 "sourceUrl": "https://example.test/show", "endDate": "2027-01-30",
                 "sourceDateText": "4 dec. 2026 — 30 jan. 2027", "lastVerified": "2026-11-22"}
        result, = reverify([event], "2026-12-01", fetcher=lambda _: "The Blue Highway: postponed",
                           robots=lambda _: (True, "test"))
        self.assertEqual(result["status"], "dates-need-review")
        self.assertEqual(event["lastVerified"], "2026-11-22")

    def test_weekly_verification_interval(self):
        self.assertFalse(needs_verification("2026-10-24", "2026-10-29"))
        self.assertTrue(needs_verification("2026-10-22", "2026-10-29"))

    def test_only_verified_title_advances_date(self):
        events = [
            {
                "id": "one",
                "title": "Where the Wildflowers Bloom",
                "sourceType": "official",
                "sourceUrl": "https://example.test/current",
                "endDate": "2026-11-08",
                "lastVerified": "2026-10-20",
            },
            {
                "id": "two",
                "title": "Missing Show",
                "sourceType": "official",
                "sourceUrl": "https://example.test/current",
                "endDate": "2026-11-08",
                "lastVerified": "2026-10-20",
            },
        ]

        results = reverify(
            events,
            "2026-10-29",
            fetcher=lambda _url: "Where the Wildflowers Bloom — current exhibition",
            robots=lambda _url: (True, "robots-test"),
        )

        self.assertEqual(events[0]["lastVerified"], "2026-10-29")
        self.assertEqual(events[1]["lastVerified"], "2026-10-20")
        self.assertEqual(results[0]["status"], "verified")
        self.assertEqual(results[1]["status"], "title-not-found")


if __name__ == "__main__":
    unittest.main()
