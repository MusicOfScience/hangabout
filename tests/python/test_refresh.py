import json
from pathlib import Path

from scripts.refresh_sources import apply_results, load_allowed_hosts, parse_studio_page, source_allowed


ROOT = Path(__file__).resolve().parents[2]


def test_creative_spaces_fixture_extracts_only_explicit_facts():
    html = (ROOT / "tests/fixtures/refresh/creative-spaces.html").read_text()
    parsed = parse_studio_page(html)
    assert parsed["availability"] == "available now"
    assert parsed["availabilityStatus"] == "advertised"
    assert parsed["priceAmount"] == 370
    assert parsed["pricePeriod"] == "month"
    assert parsed["candidateLinks"] == ["/space/other-studio"]


def test_parser_output_is_json_serialisable():
    html = (ROOT / "tests/fixtures/refresh/creative-spaces.html").read_text()
    json.dumps(parse_studio_page(html))


def test_price_without_tax_basis_does_not_invent_one():
    parsed = parse_studio_page("<p>Availability: Available</p><p>$300 per month</p>")
    assert parsed["price"] == "A$300/month"


def test_source_allowlist_comes_from_policy():
    hosts = load_allowed_hosts()
    assert "creativespaces.net.au" in hosts
    assert source_allowed("https://www.creativespaces.net.au/space/example", hosts)
    assert not source_allowed("https://example.com/space/example", hosts)


def test_failed_refresh_preserves_last_good_vacancy():
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
    assert vacancies[0]["lastVerified"] == "2026-08-19"
    assert vacancies[0]["availabilityStatus"] == "advertised"


def test_successful_refresh_updates_only_explicit_observations():
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
    assert vacancies[0]["availabilityStatus"] == "occupied"
    assert vacancies[0]["price"] == "A$300/month + GST"
    assert vacancies[0]["lastVerified"] == "2026-09-24"


def test_unchanged_daily_check_does_not_create_date_churn():
    vacancies = [{"premisesId": "premises-1", "lastVerified": "2026-09-23"}]
    apply_results(vacancies, [{
        "premisesId": "premises-1",
        "status": "ok",
        "checkedAt": "2026-09-24",
        "changed": False,
        "observed": {},
    }])
    assert vacancies[0]["lastVerified"] == "2026-09-23"
