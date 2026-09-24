# National gallery discovery and programme refresh plan

Status: milestone 1 implemented on feature branch `codex/national-studio-data`, inspected 2026-09-24. The application remains static-first: the national contract and offline ingestion pilot produce reviewable candidates, while only promoted records enter the catalogue. National gallery/exhibition discovery, including regional Australia, remains the next coverage expansion; studio discovery stays in inner and outer Melbourne.

## Existing boundaries

- `src/data/load.ts` merges three venue/event layers and two resource layers by stable ID, then applies the separate coordinate overlay. Later layers replace earlier records. Keep existing IDs and deep links during migration; reject accidental collisions rather than silently replacing unrelated records.
- `src/types.ts` now carries optional country/state/locality/region/timezone/coverage fields and coordinate precision for national records. Studio resources retain stable IDs while `data/studio-vacancies.json` tracks time-sensitive listings separately.
- `scripts/discover_official.py` reads 11 approved first-party programme indexes, checks robots and emits candidate links. It neither discovers new canonical galleries nor extracts verified programmes. `.github/workflows/source-discovery.yml` runs weekly and retains a review artifact for 14 days.
- `src/live-discovery.ts` provides user-triggered Overpass candidates and Nominatim labels, with small in-memory caches. These are not maintained venue records or exhibition evidence. The static known-place layer contains 20 Victorian places.
- `src/time.ts` accepts an explicit venue timezone (with Melbourne as the legacy default); `src/geo.ts` refuses to map national records without coordinates while retaining the existing Melbourne locality fallback for legacy studio resources. `src/main.ts` owns search, history and rendering; `src/map.ts` owns map/list interaction. National discovery preserves those interaction contracts.

## Hosting decision

Start with scheduled Python ingestion in GitHub Actions, reviewed JSON snapshots in Git and the existing Vite/GitHub Pages app. Publish a small manifest plus region/state shards only when measured payload size warrants it; the initial registry can remain bundled. Browser search can filter a static index by state, locality, bounding box and distance without a separate API.

This repository is public. Standard GitHub-hosted runner usage for public repositories is currently free ([GitHub billing documentation](https://docs.github.com/en/billing/concepts/product-billing/github-actions), checked 2026-09-23). Keep jobs bounded and artifacts short-lived; do not assume all storage or future services are free. A first pilot budget is one weekly discovery run plus a daily due-source refresh, capped at 20 minutes per run and one concurrent run. Measure requests, duration, artifact size and review workload before increasing scope. No paid geocoder, database, runner or hosting change is authorised here.

Schedules are best effort and run on the default branch; delays and dropped runs are possible ([GitHub event documentation](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows)). Freshness must use actual check timestamps, never the planned cron time. Keep a manual retry path and report missed/failed refreshes. Do not dispatch or deploy during this setup milestone.

Initially retain read-only scheduled jobs producing review artifacts. A later approved change may create a bot feature branch and PR with narrow permissions. Never write generated records directly to main or auto-merge. Note that GitHub-token-created events may not trigger downstream CI: validate in the ingestion job and explicitly design/test PR validation before adding a bot. A maintainer merge still follows existing Pages release gates.

A separate hosted API is warranted only after measured requirements exceed static snapshots (for example, timely per-user queries that cannot be served by bounded shards). Compare actual traffic, query latency, operational ownership and monthly costs then.

## Data and verification contract

| Entity | Identity and evidence | Lifecycle |
| --- | --- | --- |
| Gallery candidate | Candidate ID from source namespace and native ID/canonical URL; discovery URL, observed time, licence/access policy | discovered, needs-review, verified, rejected; never implies an exhibition |
| Canonical venue | Existing persistent ID or assigned immutable ID; aliases, former URLs/names, country AU, state/territory, locality, region, address, IANA timezone | active, uncertain, closed; closure needs evidence |
| Exhibition | Stable source event ID mapped to canonical ID and venue ID; factual title/artists, local date range, official URL, optional supported admission/opening fields | candidate, verified, stale, expired, cancelled |
| Check attempt | Source ID, attemptedAt, fetchedAt, lastSuccessfulFetch, lastVerified, status, content hash, adapter version, error and nextDueAt | success, not-modified, blocked, failed, parse-error; independent of entity state |
| Coordinates | Value, source URL, verification time, precision (building/exact/locality) and method | Unknown coordinates remain null; locality centres never become exact pins |

Keep make-art availability in its own resource records. Unknown price, hours, access or vacancies stay unknown. Separate verification of existence, address, hours and each exhibition fact so checking a venue homepage cannot freshen its programme. Retain raw evidence only where permitted, with bounded retention; never copy protected descriptions/images by default.

Normalise URLs conservatively (remove fragments and recognised tracking parameters, retain meaningful queries). Match exact external IDs first; then canonical domain/address and reviewed aliases. Name/proximity similarity produces a review suggestion, never an automatic merge. Different premises at the same institution remain distinct; touring exhibitions have separate venue occurrences. Persist redirects/aliases so historical links and saved IDs continue working.

## Discovery and refresh

1. Expand the source registry to approved national/state/local cultural datasets and first-party networks, including regional councils, public galleries, ARIs and First Nations-led spaces. Record access/reuse conditions before enabling an adapter. Restricted directories remain manual reference sources.
2. Discover gallery candidates from eligible indexes; resolve their official websites and stable programme pages. Human review or a narrowly specified evidence rule promotes the venue separately from events. Public OSM candidates remain labelled unverified.
3. Prefer authorised structured feeds, JSON-LD, RSS/iCal or APIs; otherwise use bounded source-specific HTML adapters. Reject incomplete/ambiguous dates; do not infer a year from the current date or treat a directory listing as a current show.
4. Use per-host queues, explicit robots and redirect-host checks, timeouts, response-size limits, conservative rate limits and bounded retry/backoff with Retry-After support. Unknown/changed policy pauses the source. Robots compliance alone is not permission to reuse content.
5. Cache eligible responses with ETag/Last-Modified and hashes. A 304 can confirm unchanged previously validated facts only if the stored representation and adapter remain valid; it cannot verify missing fields. Failed fetches or parsing preserve the last good snapshot and lastVerified. Empty extraction is a review alert, not mass deletion.
6. Persist run summaries and checkpoints independently of disposable Actions caches. Cache loss triggers safe refetch, never data loss. Apply schema/ID/diff validation atomically before writing candidate output; flag anomalous count drops or large changes for review.

Retain the current release limits: current/upcoming events and studio/opportunity records 14 days, workspaces/finders 60 days, venues 90 days. Target event review weekly, with daily due-source scheduling and backoff; target new gallery discovery weekly and venue checks monthly/quarterly. Do not silently relax these gates. Explicitly expired events remain historical, disappear from current results using venue-local dates, and retain IDs. Stale records display their age and uncertainty; any revised release/UI policy needs its own reviewed change. Failed checks do not turn unknown availability into no availability.

## Geographic search and time

Build national geography into the contract from the first pilot, even if initial adapters cover only a few regions. Start with one metropolitan and one regional approved source, then add interstate fixtures and sources before claiming national coverage. Separate maintained programmes, known galleries without programmes, and outside coverage in both map and list.

Use state/locality/region facets plus bounding-box/radius search over verified coordinates. Keep approximate locality matches explicitly labelled. Add clustering and lazy region loading only after measuring national payload/rendering performance. Preserve search-area refresh, stale-response rejection, deep links, browser history, saved items and mobile map spacing. Existing live discovery's rejected-promise cache and in-flight map-movement handling deserve focused tests before extension.

Replace Melbourne-only time helpers with explicit venue timezone inputs (for example Australia/Melbourne, Australia/Brisbane, Australia/Adelaide, Australia/Perth, Australia/Darwin, Australia/Hobart and Australia/Sydney as appropriate). Resolve actual locality exceptions rather than assigning zones solely by state. Store date-only exhibition boundaries as local calendar dates; opening instants need a zone or offset. Test daylight-saving transitions, half-hour offsets, midnight and cross-year dates. Keep date-only rendering independent of the viewer's timezone.

## First implementation milestone and acceptance

**Delivered: a persistent candidate/check contract and fixture-driven ingestion pilot, without changing production publication.** `scripts/ingestion/replay.py` normalises structured JSON and explicit first-party HTML fixtures, derives stable IDs, deduplicates candidates, and preserves prior records for timeout, rate-limit, robots, malformed, empty, 304 and not-found checks. `scripts/validate_national_contract.py` validates Australian state/timezone records and interstate fixtures. `data/studio-vacancies.json` separates refreshable listings from durable studio premises while preserving existing resource IDs and deep links.

Acceptance:

- A fixture introduces a new gallery candidate and a separate exhibition candidate with source evidence; neither appears in the live catalogue without promotion.
- Two identical runs produce identical entity IDs and no duplicates; aliases and conflicting identities are covered.
- Fixtures cover structured metadata, HTML, redirects, robots denial, timeout, 429, malformed/empty response, 304, changed dates and removed listings.
- Failure replay preserves the last good record and verification timestamp, marks failure/staleness and schedules a bounded retry.
- Fixed-clock tests cover Australian timezone boundaries and expiry; fixture tests make no network calls. Live smoke checks run separately and report actual source outcomes.
- Scheduled output includes per-source success/skip/error/zero-result counts and a reviewable diff. A green workflow alone is not ingestion success.
- All structural validators, typecheck, build and desktop/mobile regressions pass; the independent real-date freshness gate remains truthful.

Subsequent focused PRs: reviewed promotion and source coverage; timezone/geography migration; static national search/shards and candidate UX; broader scheduled adapters and operational reporting. Refresh the currently stale catalogue with genuine source checks before any production release.
