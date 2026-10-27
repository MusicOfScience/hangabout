# Hangabout v1 programme model experiment

Status: experimental branch only. No production publication is authorised by this document.

## Why this exists

The current `Event` record is structurally an exhibition: it has a venue, artist list and date range, with an optional embedded opening. That worked for the prototype, but it cannot cleanly represent artist talks, performances, tours, launches, workshops, poetry events, auctions or standalone openings.

v1 therefore distinguishes:

- **Exhibition** — a date-range art presentation.
- **ProgrammeEvent** — a timed item at a venue, optionally linked to an exhibition.
- **SourceObservation** — what an external source actually said before Hangabout interprets it.

The current UI remains stable during the experiment. Existing `events*.json` records are loaded as `Exhibition` and also exposed through the legacy `dataset.events` alias. `data/programme-events.json` starts empty.

## Relationship model

```text
Venue
  ├─ Exhibition
  │    └─ ProgrammeEvent (optional exhibitionId)
  └─ ProgrammeEvent (standalone)

ProgrammeSource
  └─ SourceObservation
       └─ review / normalise / resolve
            ├─ Venue
            ├─ Exhibition
            └─ ProgrammeEvent
```

An external observation never becomes canonical merely because a parser can read it.

## Workshops are first-class programme events

A workshop is not an exhibition and should not be reduced to an undifferentiated "opportunity". It is a timed event that may be associated with an artist residency, exhibition, public programme or venue without requiring any of those relationships.

Timed events therefore support named people with explicit source-backed roles such as `facilitator`, `speaker`, `guide`, `curator`, `performer`, `artist` and `host`. Workshop-specific practical information is optional and factual: registration requirements/status, price text, audience notes and materials notes are stored only when a source supports them.

A workshop-shaped record can therefore look like:

```json
{
  "eventType": "workshop",
  "startDate": "2026-10-24",
  "startTime": "11:00",
  "endDate": "2026-10-24",
  "endTime": "12:30",
  "people": [
    { "name": "Jodi Wiley", "role": "facilitator" }
  ],
  "registration": {
    "required": true,
    "status": "unknown"
  }
}
```

This is an example of the data shape, not a claim that every field has been independently verified for that particular session.

If a workshop repeats on multiple dates/times, each independently attendable or bookable session should normally be a separate `ProgrammeEvent`. A later series/group identifier can connect sessions if the product needs it; v1 does not need a new `ProgrammeSeries` entity merely to represent recurrence.

## Charles Art Openings pilot

The first intended calendar-source pilot is Charles's Melbourne art-openings calendar, identified as `charles-art-openings`.

Public subscription entry point used in prior Hangabout research:

`https://calendar.google.com/calendar/u/0/r?cid=charles.artopenings@gmail.com`

The experimental parser in `scripts/ical_observations.py` accepts a local/exported `.ics` file and emits reviewable source observations. It deliberately does not hard-code a guessed iCalendar export endpoint. A stable machine-readable feed URL should be verified explicitly before scheduled fetching is added.

The parser currently preserves:

- source ID
- calendar UID as external ID
- summary/title
- full raw DTSTART and DTEND properties, including TZID parameters
- location
- URL when supplied
- raw calendar status such as `CANCELLED`
- observation timestamp
- payload hash

It does **not** yet:

- classify an observation as an opening/talk/performance/etc.
- match a location to a canonical Hangabout venue.
- infer an exhibition from the title.
- normalise date/time into a canonical instant.
- publish anything into `data/programme-events.json`.

That separation is deliberate.

## Provenance and permission

Charles's calendar is useful discovery evidence, not automatic authority for every canonical field. Hangabout should retain attribution and source provenance, corroborate exhibition facts against first-party venue/gallery sources where practical, and seek permission before treating the maintained calendar as a permanent production redistribution dependency.

## Acceptance criteria for this experiment

1. Current Hangabout behaviour remains unchanged when `programme-events.json` is empty.
2. Existing IDs and deep links remain stable.
3. Typecheck/build and current browser regressions continue to pass.
4. iCalendar parsing is deterministic for a stable source UID.
5. Time-zone parameters are not discarded during ingestion.
6. Cancellation/status evidence is preserved without automatically mutating canonical data.
7. A later review step can promote an observation to a `ProgrammeEvent` without altering the stored observation.
8. Workshop-shaped events can represent facilitator and registration/practical metadata without overloading exhibition `artists`.
