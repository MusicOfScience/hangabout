import json
from pathlib import Path

import scripts.validate_programme_data as programme_validation


def write(path: Path, value) -> None:
    path.write_text(json.dumps(value), encoding="utf-8")


def minimal_data_dir(tmp_path: Path) -> Path:
    data = tmp_path / "data"
    data.mkdir()
    write(data / "venues.json", [{"id": "mungga-artist-studios-ivanhoe"}])
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
                "id": "jodi-wiley-found-in-nature-2026-10-24",
                "venueId": "mungga-artist-studios-ivanhoe",
                "title": "Found in Nature: A still life workshop",
                "eventType": "workshop",
                "startDate": "2026-10-24",
                "startTime": "11:00",
                "endDate": "2026-10-24",
                "endTime": "12:30",
                "people": [{"name": "Jodi Wiley", "role": "facilitator"}],
                "admission": "free",
                "registration": {
                    "status": "fully-booked",
                    "capacityNote": "Fully Booked",
                },
                "locationNote": "Mungga Artist Studios @ Ivanhoe Library and Cultural Hub",
                "sourceName": "Jodi Wiley / Humanitix screenshot fixture",
                "sourceType": "official",
                "sourceUrl": "https://example.test/source-supplied-screenshot",
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
                "venueId": "mungga-artist-studios-ivanhoe",
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
