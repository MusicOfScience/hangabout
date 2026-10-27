# Hangabout v1.0 release notes

Release date: 28 October 2026

## What v1.0 is

Hangabout v1.0 is a Melbourne-first, source-backed art discovery service built around two practical modes: **see art** and **make art**. It deliberately favours attributable, explicitly incomplete information over apparently comprehensive listings whose dates, hours or availability cannot be defended.

## See art

- Map + list discovery for current exhibitions.
- A separate **happening soon** layer for timed art programmes rather than conflating an exhibition with its opening or associated events.
- Timed event support for openings, artist talks, tours, workshops, performances, screenings, launches and other independently attendable programmes.
- **Tonight**, **next 7 days** and **all upcoming** programme windows.
- Exact source-backed start/end times where published; an unknown end time remains unknown.
- Participant roles such as facilitator, speaker, curator, guide, performer and artist.
- Admission/price, booking state, capacity status, audience and materials notes where sources support them.
- Search across exhibition/event content and venue names.
- Saved exhibitions, proximity-based **your crawl**, and external navigation handoff.

## Make art

- Studio, workspace, opportunity and artist-pathway discovery remains part of the same art ecology.
- Stable studio premises are separated from volatile vacancy observations.
- Stale vacancy information can remain useful historical context but is labelled as previously listed and cannot answer **available now**.

## Data and provenance

v1.0 formalises four separate concepts:

- `Venue`
- `Exhibition`
- `ProgrammeEvent`
- `SourceObservation`

External calendars/directories can produce observations and review candidates without automatically becoming published Hangabout records. Venue/entity resolution is deliberately conservative: high-confidence matches can be suggested; ambiguous records remain review/unresolved.

First-party venue/institution sources win when sources disagree. Unknown admission, hours, event duration, booking state or accessibility facts are not invented to fill empty UI.

## Freshness and live claims

- Stale exhibitions leave the live discovery catalogue while remaining available in the underlying archive/data.
- Timed programme events leave the live programme once their 14-day verification deadline passes, even if their scheduled event date is still in the future.
- Venue hours older than their live-claim verification window stop driving **open now/open today** answers and degrade to unverified.
- Current studio availability filters fail closed when vacancy evidence is stale.

## Discovery sources

The first iCalendar/source-observation tooling is included, along with conservative programme venue/type resolution.

**Art Openings Melbourne / Charles** is registered as a reference-only discovery source. Hangabout does not treat a public calendar as a redistribution licence; scheduled reuse should wait for permission, while canonical facts are corroborated against first-party sources.

## Reliability work

The v1 pass added or hardened:

- programme-data referential validation;
- source-policy validation;
- venue/entity-resolution regressions;
- freshness audits;
- Melbourne-time and unknown-duration behaviour;
- desktop Chrome and mobile Safari interaction tests;
- fail-soft map behaviour;
- a mobile-Safari Leaflet race where a duplicate `moveend` could overwrite a meaningful discovery error state;
- deployment-time validation parity so GitHub Pages cannot bypass programme/source/geography checks that protect pull requests.

## Deliberately not in v1.0

- national coverage;
- accounts/social features;
- recommendation AI;
- push notifications;
- native applications;
- offline/PWA claims;
- artwork-image ingestion without a rights model;
- a persistent application backend;
- pretend-optimal public-transport or multi-stop routing.

## Known scope limitation

Hangabout does **not** claim exhaustive Melbourne coverage. The maintained programme is intentionally finite. Empty states say that nothing is currently **verified in Hangabout's maintained coverage**, not that nothing is happening in Melbourne.
