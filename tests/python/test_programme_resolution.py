from scripts.resolve_programme_observations import resolve_observations


def venues():
    return [
        {
            "id": "acca",
            "name": "ACCA",
            "address": "111 Sturt St Southbank",
            "suburb": "Southbank",
        },
        {
            "id": "harlow-gallery",
            "name": "Harlow Gallery",
            "address": "355 Sydney Rd Brunswick",
            "suburb": "Brunswick",
        },
        {
            "id": "brunswick-mechanics",
            "name": "Brunswick Mechanics Institute",
            "address": "270 Sydney Rd Brunswick",
            "suburb": "Brunswick",
        },
    ]


def test_exact_name_and_address_match_is_promoted():
    report = resolve_observations(
        [{
            "id": "obs-1",
            "titleRaw": "Harlow Gallery - Chris Bilby",
            "locationRaw": "355 Sydney Rd, Brunswick",
        }],
        venues(),
    )
    result = report["results"][0]
    assert result["resolution"] == "matched"
    assert result["selectedVenueId"] == "harlow-gallery"


def test_explicit_event_type_is_hinted_without_guessing_opening():
    report = resolve_observations(
        [
            {
                "id": "obs-tour",
                "titleRaw": "ACCA - Audio Described and Tactile Tour : NEW26",
                "locationRaw": "111 Sturt St Southbank",
            },
            {
                "id": "obs-show",
                "titleRaw": "Harlow Gallery - Chris Bilby",
                "locationRaw": "355 Sydney Rd Brunswick",
            },
        ],
        venues(),
    )
    assert report["results"][0]["eventTypeHint"] == "tour"
    assert report["results"][1]["eventTypeHint"] is None


def test_rsvp_essential_is_registration_evidence_not_booking_url_invention():
    report = resolve_observations(
        [{
            "id": "obs-screening",
            "titleRaw": "Composite @ Next Wave - Edwina Stevens screening (RSVP essential)",
            "locationRaw": "Brunswick Mechanics Institute 270 Sydney Rd Brunswick",
        }],
        venues(),
    )
    result = report["results"][0]
    assert result["eventTypeHint"] == "screening"
    assert result["registrationHint"] == {
        "required": True,
        "status": "unknown",
        "evidence": "title says RSVP essential",
    }


def test_ambiguous_or_unknown_venue_stays_out_of_canonical_match():
    report = resolve_observations(
        [{
            "id": "obs-unknown",
            "titleRaw": "Mystery Project - New work",
            "locationRaw": "Somewhere in Melbourne",
        }],
        venues(),
    )
    result = report["results"][0]
    assert result["resolution"] == "unresolved"
    assert result["selectedVenueId"] is None
