# hangabout

**art around you**

A Melbourne-first art discovery service for people who see art and people who make it.

`hangabout` answers practical questions that art listings often leave fragmented: **what can I see, what is happening soon, where is it, what else is nearby, and how do I get there?** It treats artist-run initiatives, First Nations-led spaces, public institutions, commercial galleries, university galleries, specialist organisations and independents as parts of one ecology.

## v1 release candidate

The v1 candidate includes:

- current exhibition discovery as a map + list surface
- a separate timed programme for openings, talks, tours, workshops, performances and other independently attendable art events
- source-backed event details including participant roles, admission, booking state, audience/material notes and exact times where published
- search by artist, venue, suburb, medium, event type and space type
- filters for **open now**, **open today**, **this weekend**, opening events, closing soon, free entry and within 5 km
- Melbourne-time opening logic using only hours checked against a first-party source
- stale programme records retained in the archive/data but excluded from the live discovery catalogue once they pass the stale threshold
- saved shows stored locally in the browser
- a multi-stop **your crawl** proximity route handed off to Google Maps for walking, cycling and driving; public transport remains a single-destination navigation choice rather than a falsely supported multi-stop optimiser
- per-venue Google Maps, Apple Maps and Waze links using canonical street addresses
- a separate **make art** directory with studios, workspaces, opportunities, access notes and verified artist pathways where known
- explicit provenance: source type, source name, source URL and verification date
- progressive map enhancement: if map tiles or discovery services fail, the listing and navigation surfaces continue to work

The maintained programme is deliberately finite. It is **not** a claim of exhaustive Melbourne coverage; incomplete coverage is stated rather than concealed.

## product principles

1. **Truthful before clever.** Unknown hours, admission, end times and availability stay unknown rather than being inferred.
2. **Do not bury the small stuff.** Major institutions, ARIs, First Nations-led spaces, project spaces, commercial galleries and student work belong in one discovery ecology.
3. **Provenance is part of the UX.** Canonical programme records retain source and verification evidence.
4. **First-party data wins.** Official venue/institution pages are preferred for dates, times, hours, access and booking facts. Directories and public calendars are discovery/cross-check sources unless reuse is explicitly permitted.
5. **Discovery is not publication.** External observations pass through review/entity resolution before canonical promotion.
6. **Melbourne is a scope, not the architecture.** Geographic fields and venue-local time zones are already explicit so later expansion does not require a product rewrite.
7. **No account required.** Saves and crawl choices remain local-first until a backend solves a real problem.
8. **No maturity theatre.** No recommendation AI, social layer, native app, PWA/offline claim or backend simply to look more like a startup.
9. **Low-volume maps stay policy-compliant.** v1 uses OpenStreetMap standard raster tiles for ordinary interactive viewing with visible attribution and no bulk/offline prefetch. The provider is an operational dependency to revisit if traffic or use patterns materially grow.

## programme model

`hangabout` deliberately distinguishes a date-range exhibition from a timed programme event:

```text
Venue
  ├─ Exhibition
  │    └─ ProgrammeEvent (optional link)
  └─ ProgrammeEvent (standalone)

ProgrammeSource
  └─ SourceObservation
       └─ review / normalise / resolve
            ├─ Venue
            ├─ Exhibition
            └─ ProgrammeEvent
```

Examples of `ProgrammeEvent` include an opening, artist talk, workshop, tour, screening, performance or launch. A workshop can carry a facilitator, booking/capacity state, price, audience and materials information without pretending those fields describe an exhibition.

## structure

```text
index.html                            # Vite application shell
src/main.ts                           # exhibition filters, results, saves, crawl and make-art directory
src/programme-entry.ts                # timed programme discovery surface
src/map.ts                            # Leaflet exhibition and make-art maps
src/live-discovery.ts                 # user-triggered OpenStreetMap place discovery
src/time.ts                           # venue-local Australian calendar semantics
src/styles.css / src/programme.css    # editorial visual system + programme layer
data/venues*.json                     # canonical + current venue layers
data/events*.json                     # date-range exhibitions + provenance
data/programme-events.json            # timed programme events
scripts/ical_observations.py           # loss-minimising iCalendar observation parser
scripts/resolve_programme_observations.py # conservative venue/type review resolver
scripts/validate_data_v3.py            # layered data-contract validation
scripts/validate_programme_data.py     # timed programme validation
scripts/validate_freshness.py          # source-linked freshness audit
sources/source-policy.json             # automation/reference-source policy
.github/workflows/validate.yml         # PR/main validation
.github/workflows/pages.yml            # verify -> stage -> deploy Pages
tests/e2e/                             # desktop/mobile interaction regressions
docs/hostile-review.md                 # adversarial product review
```

## local development

Use Node 22, npm 10 and Python 3.13. Install locked dependencies with:

```sh
npm ci --no-audit --no-fund
```

Then run the validation/build path described in [Local development](docs/LOCAL_DEVELOPMENT.md).

Useful project documents:

- [Current handover](docs/HANDOVER.md)
- [v1 programme model](docs/V1_PROGRAMME_MODEL.md)
- [Coverage and freshness](docs/coverage-and-freshness.md)
- [National discovery plan](docs/NATIONAL_DISCOVERY_PLAN.md) — post-v1 expansion planning, not the current release milestone

The offline ingestion pilot produces review artifacts only; it does not promote candidates into the catalogue.

## data and freshness contract

### Venue

A venue has a stable ID, controlled kind, canonical address, website, focus tags and provenance. Coordinates are optional. Hours only drive **open now / open today / weekend** behaviour when they have been verified against a source.

### Exhibition

An exhibition is a date-range art presentation with venue, artists, dates, tags/admission where known and source evidence. Historical/stale exhibitions remain available in the data layer, but stale records are not eligible for the live discovery surface until reverified.

### ProgrammeEvent

A programme event is independently attendable at a specific date/time and can optionally link to an exhibition. It can carry named people with roles, admission/price, booking status, practical audience/material notes and event status.

### SourceObservation

A source observation preserves what an external source actually supplied before Hangabout interprets it. Parsing or matching never by itself grants publication authority.

## source / rights policy

Do not scrape or mirror third-party listing services without permission. Store factual metadata needed to identify and navigate to a programme item; link back to the source. Do not ingest artwork images or protected exhibition descriptions into the critical path without an explicit licence or permission model.

Charles Art Openings is currently registered as a **reference-only discovery source**. Scheduled ingestion or redistribution should wait for explicit permission; canonical records are corroborated against first-party venue/institution sources.

## after v1

Once the Melbourne product is trustworthy in real use, likely next questions include broader automated programme refresh, better venue/entity resolution, and staged geographic expansion. The existing national plan remains useful, but **national coverage is no longer the v1 release gate**.
