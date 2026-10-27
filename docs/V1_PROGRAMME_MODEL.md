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
