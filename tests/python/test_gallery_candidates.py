import unittest

from scripts.discover_gallery_candidates import candidates


class GalleryCandidateTests(unittest.TestCase):
    def test_identity_uses_reviewed_item_id_and_retains_alternate_websites(self):
        def row(item, website):
            return {"item": {"value": f"http://www.wikidata.org/entity/{item}"},
                    "itemLabel": {"value": "Same name"}, "website": {"value": website}}

        rows = [row("Q1", "https://one.example"), row("Q1", "https://one.example"),
                row("Q1", "https://two.example"), row("Q2", "https://one.example")]
        first, second = candidates(rows, {"Q1": "reviewed-gallery"})
        self.assertEqual(first["matchedVenueId"], "reviewed-gallery")
        self.assertEqual(first["websiteCandidates"], ["https://one.example", "https://two.example"])
        self.assertIsNone(second["matchedVenueId"])
