from pathlib import Path

from scripts.ical_observations import parse_ical


ROOT = Path(__file__).resolve().parents[2]


def test_charles_style_fixture_preserves_source_identity_and_raw_time_zone():
    fixture = ROOT / "tests" / "fixtures" / "calendars" / "charles-sample.ics"
    observations = parse_ical(
        fixture.read_text(encoding="utf-8"),
        source_id="charles-art-openings",
        observed_at="2026-10-01T09:00:00+10:00",
    )

    assert len(observations) == 2
    first = observations[0]
    assert first["sourceId"] == "charles-art-openings"
    assert first["externalId"] == "hangabout-fixture-001@example.test"
    assert first["titleRaw"] == "Oigall Projects – Thomas Guida; Morgan Stokes + Matthew Allen"
    assert first["locationRaw"] == "122 Gertrude St, Fitzroy VIC 3065"
    assert first["startRaw"] == "DTSTART;TZID=Australia/Melbourne:20261001T173000"
    assert first["endRaw"] == "DTEND;TZID=Australia/Melbourne:20261001T200000"


def test_parser_keeps_cancelled_status_as_source_evidence_without_interpreting_it():
    fixture = ROOT / "tests" / "fixtures" / "calendars" / "charles-sample.ics"
    observations = parse_ical(
        fixture.read_text(encoding="utf-8"),
        source_id="charles-art-openings",
        observed_at="2026-10-01T09:00:00+10:00",
    )

    assert observations[1]["calendarStatusRaw"] == "CANCELLED"
    assert observations[1]["status"] == "observed"


def test_observation_ids_are_stable_for_the_same_source_uid():
    fixture = ROOT / "tests" / "fixtures" / "calendars" / "charles-sample.ics"
    text = fixture.read_text(encoding="utf-8")
    first = parse_ical(text, source_id="charles-art-openings", observed_at="2026-10-01T09:00:00+10:00")
    second = parse_ical(text, source_id="charles-art-openings", observed_at="2026-10-02T09:00:00+11:00")

    assert [item["id"] for item in first] == [item["id"] for item in second]
    assert [item["payloadHash"] for item in first] == [item["payloadHash"] for item in second]
