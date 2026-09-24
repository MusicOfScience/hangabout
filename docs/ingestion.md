# hangabout source and ingestion model

## Goal

A Melbourne art guide cannot be maintained as a hand-written list of cards. The durable unit is the **venue registry plus each venue's stable first-party programme index**.

## Source hierarchy

1. Venue/institution first-party structured feed, JSON-LD, RSS, iCal or API.
2. Venue/institution first-party exhibitions/programme index.
3. Venue/institution first-party exhibition page.
4. Authorised/open civic or cultural data.
5. Manual curated record with explicit provenance.
6. Reference directories for gap discovery/cross-checking only where reuse or automation is restricted.

`source-policy.json` is the guardrail. A source in `referenceSources` is never fetched by the scheduled discovery job.

## Why index pages, not month-specific URLs

The discovery job starts from stable programme/index URLs on every run and rediscovers current child links. This avoids coupling hangabout to a venue's August/September file naming, CMS IDs or changing exhibition URLs.

## What the scheduled job does

`scripts/discover_official.py`:

- reads only `sources/official-indexes.json`;
- checks `robots.txt` before fetching;
- fetches a stable first-party index at a low rate;
- follows same-domain path rules;
- records candidate programme URLs and link labels;
- uploads the discovery queue as a GitHub Actions artifact for review.

It does **not** republish page copy or images and does not automatically mutate live event data.

## Scheduled source refresh

`.github/workflows/source-refresh.yml` runs daily and is deliberately separate from browser visits. It checks only sources listed under `refreshSources` in `sources/source-policy.json`; the current adapter supports permitted Creative Spaces studio listing pages. A page must expose an explicit availability field before its vacancy record can be updated. Explicit price facts are updated when present, while missing fields remain unknown rather than becoming negative facts.

Successful observations are committed to an automation branch and opened as a pull request for review. Gallery programme discovery remains a separate weekly artifact workflow; candidate galleries and exhibitions are not published automatically. Robots denials, timeouts, malformed pages and pages without explicit availability are recorded in the refresh report and preserve the last good vacancy and verification date. A durable studio premise therefore remains discoverable when a temporary vacancy is filled or its source is temporarily unavailable.

This is a scheduled, reviewable refresh rather than per-visit scraping. GitHub Actions needs network access for source pages and GitHub write permissions to open the review PR; the application itself remains a static build and works from its checked-in data without that service being available.

## Offline adapter replay

`python scripts/ingest_fixtures.py --report generated/ingestion-review.json` replays the deterministic pilot fixtures without network access. The replay accepts explicit structured JSON and first-party HTML attributes, assigns IDs from the source namespace plus native ID or canonical URL, and deduplicates identical identities. Redirects are retained as successful checks. Timeouts, 429s, robots denials, malformed/empty responses, 304s and not-found responses become review statuses; a previous record is marked preserved and its verification date is not changed. The report is a candidate/check artifact, not production data publication.

Studio premises remain in the curated make-art resource layers. `data/studio-vacancies.json` is a separate listing layer keyed by `premisesId`; a failed vacancy check cannot remove the durable premise or turn unknown availability into “no”.

## Next adapter layer

For high-value first-party sources, add source-specific adapters that prefer structured metadata and extract only factual fields needed by hangabout: title, artist, venue, start/end dates, opening time, admission, URL and verification timestamp. Generated candidates should be schema-validated and compared against the canonical registry before they are promoted to live data.

## Geography

Canonical venue addresses and exact coordinates are separate records. `data/venue-coordinates.json` carries coordinate provenance. Exact pins are never invented from suburb centres; suburb centres may be used only for approximate area membership where the UI says so.
