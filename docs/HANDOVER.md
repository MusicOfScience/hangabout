# Hangabout development handover

Verified 2026-09-23. Treat this as dated evidence and recheck Git, PRs and workflows when resuming.

## National/studio data milestone (2026-09-24)

Feature branch `codex/national-studio-data` adds the next planned data stage without changing the signed-off layout or publishing unreviewed records. Studio resource IDs remain stable; `data/studio-vacancies.json` carries separate vacancy status, price, size, source and check metadata, and the loader projects the latest listing onto the existing cards while exposing `studioPremises` and `studioVacancies` in the dataset. Structured Make Art queries now understand practice/facility fields and price limits while unknown facts remain non-matches. National venue records support AU state/locality/region/timezone/coverage fields, and venue-local opening logic works across Australian zones.

The offline ingestion pilot (`scripts/ingest_fixtures.py`) emits deterministic candidates and check statuses from JSON/HTML fixtures, including deduplication, redirects and failure preservation. Interstate venue/event fixtures are validation-only and are deliberately not in the live catalogue. Real maintained data remains the existing Melbourne/Victoria catalogue; national source promotion is the next focused PR.

## Release follow-up after the reliability PRs

Baseline: merged main `16fedff`; this branch `codex/release-freshness-deploy`.

- Gallery searches discard responses after map movement, clearing the area or showing all places. Failed request caches are evicted so the same area can be retried. An unavailable area-label service no longer suppresses successful gallery results; label fetches have a timeout.
- The studio “vacancies now” filter excludes availability older than its existing freshness limit. Stale listings remain discoverable, with availability labelled as previously listed, and no longer receive a vacancy ranking boost.
- Exhibition cards expose their checked date and warn when programme verification is overdue.
- `validate_freshness.py --report <path>` produces a source-linked recheck queue and warns without blocking the application build. `--strict` remains available for a deliberate data-maintenance gate. It does not fetch sources or update dates.
- Validation: 24 desktop/mobile browser regressions and 4 Python freshness tests pass; structural validators and typechecking pass. The source-linked queue now contains 19 event and 22 studio/opportunity records after six official programme pages were rechecked. See local-development instructions for generating the queue.

This is a reliability milestone, not completed national indexing or source re-verification. Next work remains genuine source checks followed by the fixture-driven ingestion pilot. The earlier setup evidence below is retained as history.

## Repository and authoritative baseline

- Absolute workspace: `/Users/hudson/Documents/GitHub/hangabout`.
- Origin: `https://github.com/MusicOfScience/hangabout.git`, a public repository with default branch `main`.
- Baseline after successful fetch: `16fedff` on both local main and origin/main.
- Setup branch: `chore/local-development-handover`, created from that baseline. At entry the only local change was the previously requested, untracked root `AGENTS.md`; it has been preserved and extended.
- Contents: Vite/TypeScript frontend, canonical JSON data, Python validators/discovery, Playwright tests, source policy, documentation and GitHub workflows. This is the existing checkout, not a nested clone or recreated application.

Recent main commits:

| Commit | Subject |
| --- | --- |
| `04472e2` | separate mobile studio map from search |
| `73efdc2` | repair mobile browser release gate |
| `1f58db2` | promote v2 to canonical live app |
| `0fd0390` | publish hidden-map flash fix |
| `91b46ad` | publish mobile make-art map fix |

Remote branches and all nine existing PRs were inspected. [PR #8](https://github.com/MusicOfScience/hangabout/pull/8), `agent/v2-rebuild`, remains open at `d88e0a7`, but its tree is identical to current main. Do not revive or merge it as a new baseline. Other historical PRs are merged, including [#7](https://github.com/MusicOfScience/hangabout/pull/7) for registry/first-party discovery and [#9](https://github.com/MusicOfScience/hangabout/pull/9) for the former parallel preview. Branch history differs because changes were consolidated; commit ancestry alone is not proof of missing code. No national-index implementation or separate national-work PR was found in the fetched refs or current code.

## App and deployment evidence

The canonical app is built from `src/` with Vite base `/hangabout/`. `public/v2/index.html` preserves query/hash targets when redirecting to the root. On the verification date, HTTP fetches of the public root and old v2 URL returned the application shell and that redirect respectively. [The last successful Pages run](https://github.com/MusicOfScience/hangabout/actions/runs/32953978862) built `04472e2` on 2026-08-26. This verifies shell/deployment evidence, not all current live interactions or source accuracy. No production deployment was performed during setup.

Historical handover reports deep-link, history, date, hidden-map fitting, mobile overlap, studio popup and search-area repairs. Current code and the regression suite support the deep-link/history/date/map claims. Do not interpret the seven existing test cases as exhaustive coverage: they do not directly exercise every live search-area race or external-service failure.

Merged catalogue counts, freshly measured rather than adopted as targets:

- 49 venues, with 36 effective exact/building pins after 14 coordinate overlays.
- 80 exhibitions: 53 official-source and 27 directory-source records.
- 28 make-art resources, including 17 studio premises and 5 opportunities.
- 20 cached known-art places, separate from verified exhibition coverage.
- 11 automated first-party indexes and 4 reference-only sources blocked from automation.

## Ingestion audit

There is a useful starting point, not a completed national backend. `scripts/discover_official.py` checks approved first-party indexes and emits candidate links; it does not add new galleries, parse verified exhibitions, persist HTTP caches or update live records. `src/live-discovery.ts` uses user-triggered OSM/Overpass candidates and Nominatim area labels, with in-memory caches. Those candidates do not establish a current programme.

The [latest inspected scheduled run](https://github.com/MusicOfScience/hangabout/actions/runs/35663539275), generated 2026-09-21T22:37:08Z, was green but its artifact showed 8/11 sources fetched, 3 skipped by robots and 2 successful fetches with zero links. It contained 910 candidate URLs, concentrated in KINGS (452) and Gertrude (419). This is neither 910 verified exhibitions nor a complete programme refresh. The run's exit status does not enforce per-source success.

No fresh live ingestion or factual re-verification was performed during setup. Catalogue dates and content are unchanged.

## Setup changes

- Preserve durable user instructions in root `AGENTS.md` and link the handover/development/plan documents.
- Record Node 22/Python 3.13 and npm 10; add the previously missing npm lockfile and use `npm ci` in PR/Pages workflows.
- Keep existing browser assertions, make their catalogue clock deterministic, and block external requests other than mocked tiles.
- The fixture clock starts at a repeatable date but advances normally so Leaflet pan animations finish. No application layout or catalogue change is included.
- Document exact local commands, network boundaries, honest freshness failures and a staged national plan. Update README links and mark the older Victoria-first staging guidance as historical.

See [LOCAL_DEVELOPMENT.md](LOCAL_DEVELOPMENT.md) for commands and preview instructions, and [NATIONAL_DISCOVERY_PLAN.md](NATIONAL_DISCOVERY_PLAN.md) for the architecture proposal.

## Validation on 2026-09-23

Environment: macOS arm64, Node 22.23.2, npm 10.9.9, Python 3.13.5. Dependencies and browser runtimes are installed locally.

| Check | Result |
| --- | --- |
| Python tooling compilation | Pass |
| Data contract | Pass: 49 venues, 80 events, 28 resources |
| Coordinate provenance | Pass: 14 overlays, 36/49 effective exact/building pins |
| Source policy | Pass: 11 indexes, 4 reference-only sources |
| Known-place validator | Pass: 20 records |
| Real-date freshness | **Warning**: 19 current/upcoming events and 22 studio/opportunity records remain above the 14-day review target; strict audit still fails |
| Locked dependency installation | Pass, including cached `npm ci --offline` |
| Typecheck | Pass |
| Production build | Pass |
| Desktop/mobile browser suite | Pass: 24/24 (12 desktop Chromium, 12 mobile WebKit), 9.9 seconds |
| Lint | Not configured: `package.json` has no lint script or lint dependency |

Freshness is a data-maintenance warning, not an application-integrity release blocker. Workspace/finder and venue age limits pass. Do not alter verification dates or treat a warning as verification. The six updated events were checked against current official programme pages; the remaining records stay in the queue because their facts could not be re-established from an adequately current source during this pass. The app labels stale exhibitions and excludes stale records from current-vacancy filtering; the workflow uploads the queue and continues through typecheck, browser tests and build. Use the strict audit before a deliberate catalogue refresh or data publication.

The six source-backed updates were: Juncture Art Prize ([Linden New Art](https://www.lindenarts.org/juncture-art-prize/), 20 August–9 November 2026); `language to reach with` ([West Space](https://westspace.org.au/whats-on/), 22 August–24 October 2026); Views and Vistas of the Valley ([Incinerator Gallery](https://incineratorgallery.com.au/exhibition/views-and-vistas-of-the-valley/), 18 July–31 October 2026); Grassroots Never Dies, Worldwide ([The Substation](https://thesubstation.org.au/program/grassroots-never-dies-worldwide/), 21 May–27 September 2026); Ragnar Kjartansson: Mercy ([NGV](https://www.ngv.vic.gov.au/exhibition/ragnar-kjartansson-mercy/), 26 June–4 October 2026); and CARTIER ([NGV](https://www.ngv.vic.gov.au/exhibition/cartier/), 12 June–4 October 2026). The official pages agreed with the stored title and dates when checked on 2026-09-23.

Production-path local preview: `http://127.0.0.1:4174/hangabout/`. Restart commands are in LOCAL_DEVELOPMENT.md. The temporary dev server on 5173 was also verified and stopped.

## Workflows and release safety

- `validate.yml`: pull requests, pushes to main, and manual dispatch; read-only repository permission.
- `pages.yml`: pushes to main or manual dispatch; verifies/builds then deploys with Pages permissions. A feature-branch push and ordinary PR do not trigger it.
- `source-discovery.yml`: weekly schedule and manual dispatch, read-only, 14-day artifact retention. No automatic canonical-data update or publication.

No structural validators or deployment permissions were relaxed. Freshness is now an artifact-backed warning in normal CI; `--strict` remains the deliberate data-maintenance gate. The owner reviews and merges PRs in GitHub; do not merge, auto-merge, push main or manually deploy.

## Next steps

1. Review the freshness artifact and resolve stale source-backed catalogue records. Expired opportunities need genuine review; unknown availability must remain unknown.
2. Promote the offline pilot into reviewed source adapters and a persistent candidate/check artifact, preserving last good data on failed checks; do not automatically publish candidates.
3. Add promoted interstate source coverage and static national search/shards only after review; studios remain inner/outer Melbourne.
4. Add explicit fixtures for live search-area refresh/races and failed-cache retry before expanding that surface. Retain existing desktop/mobile regressions and the editorial interface.
5. Expand maintained programmes and regional source coverage with visible coverage/freshness distinctions. Assess a separate hosted API only if measured requirements justify its cost.

For this branch's final commit use `git log -1 --oneline`; its own hash cannot be embedded in the same commit. The final task response records the pushed commit and PR URL.

## Publication authorization (resolved)

The setup commit was completed locally, but GitHub rejected the feature-branch push because the current OAuth credential has `repo`, `read:org` and `gist` scopes but lacks `workflow`. Updating the two workflow install commands requires that scope. Existing SSH access could not be verified because no trusted GitHub host key was available; no trust settings or credentials were changed. The owner subsequently approved the workflow scope and the setup branch was successfully pushed. The authentication blocker is resolved.

The recovery commands used for this branch are retained for reference:

```bash
gh auth refresh -h github.com -s workflow
git push -u origin chore/local-development-handover
gh pr create --base main --head chore/local-development-handover --title "Establish reproducible development and national discovery handover" --body-file docs/HANDOVER.md
```

This publishes the setup for review only. The catalogue freshness audit remains visible and strict mode remains available for deliberate data publication checks.
