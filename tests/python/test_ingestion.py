import json
from pathlib import Path

from scripts.ingestion.replay import replay_fixture


ROOT = Path(__file__).resolve().parents[2]


def test_fixture_replay_is_deterministic_and_deduplicates():
    fixture = ROOT / "tests" / "fixtures" / "ingestion" / "responses.json"
    first = replay_fixture(fixture)
    second = replay_fixture(fixture)
    assert first == second
    assert len(first["candidates"]) == 3
    assert any(check["status"] == "timeout" and check["preserved"] for check in first["checks"])


def test_report_is_json_serialisable():
    fixture = ROOT / "tests" / "fixtures" / "ingestion" / "responses.json"
    json.dumps(replay_fixture(fixture))
