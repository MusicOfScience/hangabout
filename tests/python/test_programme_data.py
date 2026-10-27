import json
from pathlib import Path

import scripts.validate_programme_data as programme_validation


def write(path: Path, value) -> None:
    path.write_text(json.dumps(value), encoding="utf-8")


def minimal_data_dir(tmp_path: Path) -> Path:
    data = tmp_path / "data"
    data.mkdir()
    write(data / "venues.json", [{"id": "banyule-cultural-centre"}])
    write(data / "venues-extra.json", [])
    write(data / "venues-major.json", [])
    write(data / "events.json", [])
    write(data / "events-extra.json", [])
    write(data / "events-major.json", [])
    return data


def test_workshop_can_model_facilitator_registration_and_practical_notes(tmp_path, monkeypatch):
    data = minimal_data_dir(tmp_path)
    write(
        data / "programme-events.json",
        [
            {
                "id": "workshop-example",
                "venueId": "banyule-cultural-centre",
                "title": "Workshop with Jodi Wiley",
                "eventType": "workshop",
                "startDate": "2026-10-24",
                "startTime": "11:00",
                "endDate": "2026-10-24",
                "endTime": "12:30",
                "people": [{"name": "Jodi Wiley", "role": "facilitator"}],
                "admission": "unknown",
                "registration": {"required": True, "status": "unknown"},
                "audienceNote": "Audience requirements only when source-supported",
                "materialsNote": "Materials information only when source-supported",
                "sourceName": "fixture",
                "sourceType": "official",
                "sourceUrl": "https://example.test/workshop",
                "lastVerified": "2026-10-24",
            }
        ],
    )
    monkeypatch.setattr(programme_validation, "DATA", data)

    assert programme_validation.validate() == []


def test_programme_person_requires_name_and_role(tmp_path, monkeypatch):
    data = minimal_data_dir(tmp_path)
    write(
        data / "programme-events.json",
        [
            {
                "id": "bad-workshop",
                "venueId": "banyule-cultural-centre",
                "title": "Workshop",
                "eventType": "workshop",
                "startDate": "2026-10-24",
                "people": [{"name": "Jodi Wiley"}],
                "sourceName": "fixture",
                "sourceType": "official",
                "sourceUrl": "https://example.test/workshop",
                "lastVerified": "2026-10-24",
            }
        ],
    )
    monkeypatch.setattr(programme_validation, "DATA", data)

    errors = programme_validation.validate()
    assert any("people[0].role" in error for error in errors)
