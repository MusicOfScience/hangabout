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

## Next adapter layer

For high-value first-party sources, add source-specific adapters that prefer structured metadata and extract only factual fields needed by hangabout: title, artist, venue, start/end dates, opening time, admission, URL and verification timestamp. Generated candidates should be schema-validated and compared against the canonical registry before they are promoted to live data.

## Geography

Canonical venue addresses and exact coordinates are separate records. `data/venue-coordinates.json` carries coordinate provenance. Exact pins are never invented from suburb centres; suburb centres may be used only for approximate area membership where the UI says so.
