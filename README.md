# hangabout

**art around you**

A Melbourne-first art discovery service for people who see art and people who make it.

`hangabout` answers the practical questions that art listings often leave fragmented: **what is on, where is it, can I see it today, what else is nearby, and how do I get there?** It treats artist-run initiatives, First Nations-led spaces, public institutions, commercial galleries, university galleries, specialist organisations and independents as parts of one ecology.

## current prototype

The first release candidate includes:

- exhibition discovery as a map + list surface
- search by artist, venue, suburb, medium and space type
- filters for **open now**, **open today**, **this weekend**, opening events, closing soon, free entry and within 5 km
- Melbourne-time opening logic using only hours that have been checked against a first-party source
- saved shows stored locally in the browser
- a multi-stop **your crawl** route handed off to Google Maps for walking, cycling and driving; public transport remains a single-destination navigation choice rather than a falsely supported multi-stop optimiser
- per-venue Google Maps, Apple Maps and Waze links using canonical street addresses
- a separate **make art** directory with focus areas, access notes and verified artist pathways where known
- explicit listing provenance: official source vs directory source, source URL and last-checked date
- progressive map enhancement: if Leaflet/CDN loading fails, the listing and navigation surfaces continue to work

The seed dataset is deliberately finite and editorially checked. It is a product-development corpus, not a claim of exhaustive Melbourne coverage yet.

## product principles

1. **Truthful before clever.** Unknown hours are shown as unknown. Unmapped venues stay in the list. A proximity crawl is labelled as approximate rather than sold as an optimiser.
2. **Do not bury the small stuff.** Major institutions, ARIs, First Nations-led spaces, project spaces, commercial galleries and student work belong in one discovery layer.
3. **Provenance is part of the UX.** Every event has a source type, source name, source URL and verification date.
4. **First-party data wins.** Official venue pages are preferred for dates, hours, access and artist pathways. Directories are useful discovery/cross-check sources, not licence to republish protected copy.
5. **Melbourne is a scope, not the architecture.** City-specific data is separate from application behaviour.
6. **No account required.** Saves and crawl choices are local-first until a backend solves a real problem.
7. **No maturity theatre.** No PWA/offline claims, recommendation AI or account system until those features are genuinely useful and supported.
8. **Infrastructure is provisional at prototype scale.** The standard OpenStreetMap raster tile service is used only for low-volume prototyping under its usage policy. Before meaningful traffic, offline use or a production launch, `hangabout` should move to an appropriate tile provider or self-hosted strategy.

## structure

```text
index.html                       # Vite application shell
src/main.ts                      # filters, results, saves, crawl and artist directory
src/map.ts                       # Leaflet exhibition and make-art maps
src/live-discovery.ts            # user-triggered OpenStreetMap discovery
src/time.ts                      # Melbourne calendar semantics
src/styles.css                   # editorial visual system + responsive layout
data/venues.json                 # canonical venue registry
data/events.json                 # event records + provenance
scripts/validate_data_v3.py      # data-contract validation
scripts/validate_freshness.py    # release gate for stale live-facing records
.github/workflows/validate.yml   # PR/main validation
.github/workflows/pages.yml      # verify -> stage -> deploy Pages
docs/hostile-review.md           # decisions from the adversarial v0 review
```

## local preview

```bash
npm install --no-audit --no-fund
python3 scripts/validate_data_v3.py
python3 scripts/validate_coordinates.py
python3 scripts/validate_sources.py
python3 scripts/validate_known_places.py
python3 scripts/validate_freshness.py
npm run build
npm run dev
```

Vite prints the local development address.

## data contract

### venue

A venue has a stable ID, controlled `kind`, canonical address, website, focus tags and provenance. Coordinates are optional: a venue can be useful before its map pin has been verified. Hours only drive **open now / open today / weekend** filters when `hoursVerified` is true and an `hoursSourceUrl` is present.

Artist-facing information is structured as `artistPathways` with a label and official URL. Empty means **not yet verified**, not “no opportunity exists”. Access notes are similarly source-backed when present.

### event

An event references `venueId` and carries dates, artists, event type, tags, admission state and optional opening-event time. It also carries:

- `sourceName`
- `sourceType`: `official` or `directory`
- `sourceUrl`
- `lastVerified`

The application surfaces that distinction rather than flattening all listings into equal-confidence data.

Freshness targets, release limits and the recommended Victoria-to-Australia expansion are recorded in [`docs/coverage-and-freshness.md`](docs/coverage-and-freshness.md).

## source / rights policy

Do not scrape or mirror third-party listing services without permission. Store factual metadata needed to identify and navigate to an event; link back to the source. Do not ingest artwork images or protected exhibition descriptions into the critical path unless there is an explicit licence or permission model.

## next data work

The next useful expansion is not more UI. It is deeper canonical coverage of Melbourne's ARIs, First Nations-led spaces, university galleries, public galleries, specialist venues and outer-suburban municipal programs, followed by source adapters only where first-party sites offer stable authorised feeds or structured data.
