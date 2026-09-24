import json
import unittest
from pathlib import Path

from scripts.refresh_sources import apply_results, load_allowed_hosts, parse_studio_page, source_allowed


ROOT = Path(__file__).resolve().parents[2]


class RefreshSourceTests(unittest.TestCase):
    def test_creative_spaces_fixture_extracts_only_explicit_facts(self):
        html = (ROOT / "tests/fixtures/refresh/creative-spaces.html").read_text()
        parsed = parse_studio_page(html)
        self.assertEqual(parsed["availability"], "available now")
        self.assertEqual(parsed["availabilityStatus"], "advertised")
        self.assertEqual(parsed["priceAmount"], 370)
        self.assertEqual(parsed["pricePeriod"], "month")
        self.assertEqual(parsed["candidateLinks"], ["/space/other-studio"])

    def test_parser_output_is_json_serialisable(self):
        html = (ROOT / "tests/fixtures/refresh/creative-spaces.html").read_text()
        json.dumps(parse_studio_page(html))

    def test_price_without_tax_basis_does_not_invent_one(self):
        parsed = parse_studio_page("<p>Availability: Available</p><p>$300 per month</p>")
        self.assertEqual(parsed["price"], "A$300/month")

    def test_source_allowlist_comes_from_policy(self):
        hosts = load_allowed_hosts()
        self.assertIn("creativespaces.net.au", hosts)
        self.assertTrue(source_allowed("https://www.creativespaces.net.au/space/example", hosts))
        self.assertFalse(source_allowed("https://example.com/space/example", hosts))

    def test_failed_refresh_preserves_last_good_vacancy(self):
        vacancies = [{
            "id": "vacancy-1",
            "premisesId": "premises-1",
            "availabilityStatus": "advertised",
            "availability": "available now",
            "lastVerified": "2026-08-19",
        }]
        apply_results(vacancies, [{
            "premisesId": "premises-1",
            "status": "fetch-or-parse-error",
            "error": "timeout",
        }])
        self.assertEqual(vacancies[0]["lastVerified"], "2026-08-19")
        self.assertEqual(vacancies[0]["availabilityStatus"], "advertised")

    def test_successful_refresh_updates_only_explicit_observations(self):
        vacancies = [{
            "id": "vacancy-1",
            "premisesId": "premises-1",
            "availabilityStatus": "advertised",
            "availability": "available now",
            "price": "A$300/month + GST",
            "lastVerified": "2026-08-19",
        }]
        apply_results(vacancies, [{
            "premisesId": "premises-1",
            "status": "ok",
            "checkedAt": "2026-09-24",
            "changed": True,
            "observed": {
                "availability": "occupied",
                "availabilityStatus": "occupied",
                "price": None,
                "priceAmount": None,
                "pricePeriod": None,
            },
        }])
        self.assertEqual(vacancies[0]["availabilityStatus"], "occupied")
        self.assertEqual(vacancies[0]["price"], "A$300/month + GST")
        self.assertEqual(vacancies[0]["lastVerified"], "2026-09-24")

    def test_unchanged_daily_check_does_not_create_date_churn(self):
        vacancies = [{"premisesId": "premises-1", "lastVerified": "2026-09-23"}]
        apply_results(vacancies, [{
            "premisesId": "premises-1",
            "status": "ok",
            "checkedAt": "2026-09-24",
            "changed": False,
            "observed": {},
        }])
        self.assertEqual(vacancies[0]["lastVerified"], "2026-09-23")


if __name__ == "__main__":
    unittest.main()
