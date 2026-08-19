# hangabout

**art around you**

A Melbourne-first art discovery service for people who see art and people who make it.

`hangabout` is designed to answer the practical questions that existing art listings tend to leave fragmented: **what is on, where is it, is it open, what else is nearby, and how do I get there?** It also treats artist-run initiatives, public institutions, commercial galleries, university spaces and specialist organisations as parts of one ecology rather than separate worlds.

## prototype

The first shell includes:

- current / upcoming exhibition cards
- map + list as one browsing surface
- quick filters: open now, today, weekend, openings, closing soon, free, near me
- search by artist, venue, suburb, medium and venue type
- saved exhibitions stored locally in the browser
- multi-stop **build a crawl** flow with Google Maps handoff
- per-venue Google Maps, Apple Maps and Waze navigation
- a separate **make art** venue/ecosystem view
- source + last-verified metadata
- no artwork imagery in the critical path, avoiding rights problems at launch

The August 2026 seed dataset is intentionally small and is for product development. Exhibition dates and venue details are currently derived from publicly available listings and should always be confirmed with the venue before travelling.

## product principles

1. **Do not bury the small stuff.** Major institutions, ARIs, project spaces, commercial galleries and student work belong in the same discovery layer.
2. **Provenance is a feature.** Every listing should carry its source and verification date.
3. **First-party data wins.** Prefer venue websites, authorised feeds and open public data. Third-party directories are discovery/cross-check sources, not a licence to republish protected content.
4. **Useful before clever.** Opening hours, location, access, navigation and closing dates outrank recommendation theatre.
5. **Melbourne is a scope, not the architecture.** The data model must be able to expand to Victoria and other cities without a rewrite.
6. **No account required.** Saved shows and crawls are local-first until there is a strong reason to add a backend.

## structure

```text
index.html                  # application shell
styles.css                  # visual system + responsive layout
app.js                      # filters, map, saves, crawl routing
manifest.webmanifest        # installable web-app metadata
data/venues.json            # canonical venue registry
data/events.json            # exhibition/event records
.github/workflows/          # validation + Pages deployment
```

## local preview

No build step is required for the prototype.

```bash
python3 -m http.server 8080
```

Then open `http://localhost:8080`.

## data model

A venue and an event are separate records. A venue has one canonical address, coordinate pair, type, hours and artist-facing metadata. Events reference a venue by `venueId` and carry dates, artists, tags, admission, opening-event details, source URL and verification date.

This prevents duplicate venue information and lets `hangabout` later add talks, performances, openings, opportunities and public-art records without changing the core geography.

## next build

- expand the canonical Melbourne venue registry
- add a source-adapter layer for authorised/first-party listings
- define deduplication + confidence rules
- add accessibility and public-transport metadata
- research artist-facing fields: proposals, representation model, open calls, residencies, studios and prizes
- automated stale-data checks and dead-link checks
- refine route planning around actual opening hours
- offline/service-worker support once the data pipeline is stable

## source caution

Do not add automated scraping of third-party listing platforms without confirming permission and applicable terms. `hangabout` should privilege official venue sources and authorised/open data.
