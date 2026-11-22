import json
import sys
import unittest
from copy import deepcopy
from pathlib import Path
from unittest.mock import patch

with patch.object(sys, "path", [str(Path(__file__).resolve().parents[2] / "scripts"), *sys.path]):
    from refresh_neram_venue import SOURCE, compare_venue


class NeramVenueRefreshTests(unittest.TestCase):
    def setUp(self):
        self.venue = {"name": "New England Regional Art Museum", "lastVerified": "2026-11-22",
                      "address": "106–114 Kentucky Street, Armidale NSW 2350"}
        self.pin = {"lat": -30.525271, "lng": 151.6648014, "lastVerified": "2026-11-22"}
        self.place = {
            "@type": "Place", "name": "NERAM", "url": SOURCE,
            "address": {"@type": "PostalAddress", "streetAddress": "106-114 Kentucky St",
                        "addressLocality": "Armidale", "addressRegion": "NSW",
                        "postalCode": "2350", "addressCountry": "Australia"},
            "geo": {"@type": "GeoCoordinates", "latitude": -30.525271, "longitude": 151.6648014},
        }

    def check(self, payload=None):
        source = json.dumps(self.place if payload is None else payload)
        page = f'<script type="application/ld+json">{source}</script>'
        return compare_venue(self.venue, self.pin, page, "2026-11-23")

    def test_agreement_does_not_churn_formatting_or_dates(self):
        previous = deepcopy((self.venue, self.pin))
        self.assertEqual(self.check(), {})
        self.assertEqual((self.venue, self.pin), previous)

    def test_explicit_changes_update_address_and_pin_with_separate_evidence(self):
        self.place["address"]["streetAddress"] = "120 Kentucky St"
        self.place["geo"]["latitude"] = -30.526
        result = self.check()
        self.assertEqual(set(result), {"address", "coordinates"})
        self.assertEqual(self.venue["address"], "120 Kentucky Street, Armidale NSW 2350")
        self.assertEqual(self.venue["addressLastVerified"], "2026-11-23")
        self.assertEqual(self.venue["lastVerified"], "2026-11-22")
        self.assertEqual(self.pin["lat"], -30.526)
        self.assertEqual(self.pin["sourceUrl"], SOURCE)
        self.assertEqual(self.check(), {})

    def test_ambiguous_missing_or_far_away_records_preserve_last_good_data(self):
        original_venue, original_pin = deepcopy((self.venue, self.pin))
        missing_point = {key: value for key, value in self.place.items() if key != "geo"}
        remote_point = {**self.place, "geo": {**self.place["geo"], "latitude": -33.5}}
        other_venue = {**self.place, "url": "https://www.neram.com.au/other/"}
        for record in ([self.place, self.place], missing_point, remote_point, other_venue):
            with self.subTest(record=record):
                with self.assertRaises(ValueError):
                    self.check(record)
                self.assertEqual(self.venue, original_venue)
                self.assertEqual(self.pin, original_pin)
