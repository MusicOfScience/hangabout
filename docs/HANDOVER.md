# Hangabout development handover

Verified 2026-09-23. Treat this as dated evidence and recheck Git, PRs and workflows when resuming.

## Repository and authoritative baseline

- Absolute workspace: `/Users/hudson/Documents/GitHub/hangabout`.
- Origin: `https://github.com/MusicOfScience/hangabout.git`, a public repository with default branch `main`.
- Baseline after successful fetch: `04472e2dfbbb95514be6e88d12870f641e4baac7` on both local main and origin/main.
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
| Real-date freshness | **Fail**: all 25 current/upcoming events and 22 studio/opportunity records are 28–35 days old, above the 14-day limit |
| Locked dependency installation | Pass, including cached `npm ci --offline` |
| Typecheck | Pass |
| Production build | Pass |
| Desktop/mobile browser suite | Pass: 14/14 (7 desktop Chromium, 7 mobile WebKit), 5.8 seconds |

Freshness is a real data-maintenance release blocker, not a missing runtime or frontend compilation error. Workspace/finder and venue age limits pass. Do not alter verification dates, widen age limits or skip the workflow gate to obtain green CI. A documentation/setup PR is expected to show this existing gate failure until genuine source checks repair the data. Later CI steps may be unrun because the gate fails first; local results above are separate evidence.

Production-path local preview: `http://127.0.0.1:4174/hangabout/`. Restart commands are in LOCAL_DEVELOPMENT.md. The temporary dev server on 5173 was also verified and stopped.

## Workflows and release safety

- `validate.yml`: pull requests, pushes to main, and manual dispatch; read-only repository permission.
- `pages.yml`: pushes to main or manual dispatch; verifies/builds then deploys with Pages permissions. A feature-branch push and ordinary PR do not trigger it.
- `source-discovery.yml`: weekly schedule and manual dispatch, read-only, 14-day artifact retention. No automatic canonical-data update or publication.

No triggers or freshness gates were relaxed. The owner reviews and merges PRs in GitHub; do not merge, auto-merge, push main or manually deploy. Because a main merge triggers Pages, resolve release-blocking data before merging changes intended for release.

## Next steps

1. Review this setup PR and separately resolve stale source-backed catalogue records before release. Expired opportunities need genuine review; unknown availability must remain unknown.
2. Implement the plan's first focused milestone: persistent gallery/exhibition candidate and check contracts, deterministic replay fixtures and a bounded approved-source pilot. Preserve last good data on failed checks; do not automatically publish candidates.
3. Add per-venue Australian timezones and national geographic fields/search in focused follow-up PRs; studios remain inner/outer Melbourne.
4. Add explicit fixtures for live search-area refresh/races and failed-cache retry before expanding that surface. Retain existing desktop/mobile regressions and the editorial interface.
5. Expand maintained programmes and regional source coverage with visible coverage/freshness distinctions. Assess a separate hosted API only if measured requirements justify its cost.

For this branch's final commit use `git log -1 --oneline`; its own hash cannot be embedded in the same commit. The final task response records the pushed commit and PR URL.

## Publication blocker

The setup commit was completed locally, but GitHub rejected the feature-branch push because the current OAuth credential has `repo`, `read:org` and `gist` scopes but lacks `workflow`. Updating the two workflow install commands requires that scope. Existing SSH access could not be verified because no trusted GitHub host key was available; no trust settings or credentials were changed. No setup PR was created.

After the owner completes GitHub's authentication flow, run from this repository:

```bash
gh auth refresh -h github.com -s workflow
git push -u origin chore/local-development-handover
gh pr create --base main --head chore/local-development-handover --title "Establish reproducible development and national discovery handover" --body-file docs/HANDOVER.md
```

This publishes the setup for review only. The independent catalogue freshness blocker still applies.
