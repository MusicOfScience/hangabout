# Local development

Verified 2026-09-23 at `/Users/hudson/Documents/GitHub/hangabout`. Run commands from the repository root. Recheck `pwd`, `git status --short --branch` and `git remote -v` on a different machine; do not create a nested checkout.

## Runtime and initial setup (network required)

The existing CI uses Node 22 and Python 3.13. `.nvmrc` and `.python-version` record those versions; npm 10 is the supported package manager. The setup was tested with Node 22.23.2, npm 10.9.9 and Python 3.13.5 on macOS arm64. There was no lockfile in the baseline; this change adds `package-lock.json`. Use it instead of resolving the baseline's `latest` dependency ranges again.

With Node 22/npm 10 and Python 3.13 already selected through your runtime manager:

```bash
node --version
npm --version
python3.13 --version
npm ci --no-audit --no-fund
npx playwright install chromium webkit
```

On Linux, browser system libraries may also be needed: `npx playwright install --with-deps chromium webkit`. No pip packages are required by the current Python scripts. Python must have IANA timezone data available; missing timezone data is an environment error, not stale catalogue data.

During this setup the machine's default Node was 26. An isolated Node 22/npm 10 installation was used without replacing it. To reproduce that fallback (network required):

```bash
npm install --prefix /private/tmp/hangabout-runtime --no-audit --no-fund node@22.23.2 npm@10.9.9
node /private/tmp/hangabout-runtime/node_modules/npm/bin/npm-cli.js rebuild node --prefix /private/tmp/hangabout-runtime
export PATH=/private/tmp/hangabout-runtime/node_modules/.bin:$PATH
node --version
npm --version
```

The rebuild completes Node's binary installation if the bootstrap npm blocks package install scripts. This temporary runtime can be removed by the OS; select an installed Node 22 with your usual runtime manager for lasting use. The PATH export applies only to that shell. Re-run it in later shells using this fallback.

## Validation

These commands need no external service after dependencies are installed:

```bash
python3.13 -m py_compile scripts/validate_data_v3.py scripts/validate_coordinates.py scripts/validate_sources.py scripts/validate_known_places.py scripts/validate_freshness.py scripts/discover_official.py
python3.13 scripts/validate_data_v3.py
python3.13 scripts/validate_coordinates.py
python3.13 scripts/validate_sources.py
python3.13 scripts/validate_known_places.py
python3.13 scripts/validate_freshness.py --report /private/tmp/hangabout-recheck-queue.json
npm run typecheck
npm run test:e2e
npm run build
```

The freshness audit is deliberately non-blocking: stale records are reported and retained with visible uncertainty in the app, while malformed data and broken build checks remain blocking. Use `--strict` when you intentionally need a failing data-maintenance audit. PR and Pages workflows upload the source-linked report and continue to build the application.

On 2026-09-23 the audit warned for 19 current/upcoming exhibitions and 22 studio/opportunity records, last checked 28–35 days earlier. Six event records were rechecked against current official programme pages in this release pass; the remaining records stay queued because their facts could not be re-established from an adequately current source. Do not change `lastVerified` merely to make CI pass. The 60-day workspace/finder and 90-day venue checks pass. Counts and outcomes change with the actual date.

Playwright runs 24 test cases (12 scenarios in desktop Chromium and 12 in mobile WebKit with iPhone 13 emulation), with the viewer timezone set to America/Los_Angeles. The checked-in catalogue is the local data fixture; browser time starts at 2026-08-26 and advances normally for Leaflet animations for repeatable interaction tests. Map tiles are replaced with a local transparent PNG and other external requests are blocked. This fixture clock is confined to browser tests; it does not alter the freshness validator or production data.

The suite starts its own root-base test build and Python server on `127.0.0.1:4173`. Keep that port free: local Playwright is configured to reuse an existing server, which could otherwise test the wrong build. `build:test` overwrites `dist/` for the test root; run `npm run build` again before a production-path preview. The suite covers map-movement races, failed discovery retries, area-label outages and stale vacancy filtering using synthetic responses. It does not verify live ingestion, real tiles or real-device Safari.

## Preview

For development with live code reload:

```bash
npm run dev -- --host 127.0.0.1 --port 5173 --strictPort
```

Open `http://127.0.0.1:5173/hangabout/`.

For the production-path build (the preview started for this handover):

```bash
npm run build
npm run preview -- --host 127.0.0.1 --port 4174 --strictPort
```

Open `http://127.0.0.1:4174/hangabout/`. The legacy `http://127.0.0.1:4174/hangabout/v2/` page redirects to the root and preserves query/hash targets. Stop either server with Ctrl-C. Port 4174 keeps preview separate from the test server. These commands build/serve local files only; they do not deploy.

## Offline boundaries

After setup, retained `node_modules`, browser binaries and Python are sufficient for validators, typechecking, builds, the fixture browser suite and local previews without internet. An offline reinstall was verified during setup. A reinstall can use `npm ci --offline --no-audit --no-fund` only if npm's package cache is complete; browser binaries must already be installed. Preserve those caches if disconnected work is expected. A missing package or browser is a setup failure, not an app defect.

The local catalogue, filtering, saved items, date rendering and map/list controls operate from bundled data. Actual map backgrounds need OSM tiles; live discovery needs Overpass and Nominatim; source links, web searches and external navigation need their destination services. There is no service worker or claim that the production site supports offline first-load. External service failures should not be confused with fixture regression results.

Live ingestion is separate and explicitly networked:

```bash
python3.13 scripts/validate_sources.py
python3.13 scripts/discover_official.py
```

It writes `generated/source-discovery.json`, which is a review queue, not verified live data. Do not promote or commit its contents without review. The script may return success despite source skips/errors or zero links; inspect every source status. No local live ingestion run was needed for setup: the latest scheduled artifact was inspected instead. The current script has no persisted HTTP cache or offline replay; those belong to the first ingestion milestone.

Git fetch/push, GitHub PR operations, package/browser installation and genuine source verification require network access. No API key or paid service is needed for existing local development.

## Pull request workflow

Inspect `.github/workflows/` before every push. Currently only pushes to main or an explicit manual Pages dispatch can deploy; pull requests run validation. Do not dispatch Pages, merge or push main without explicit instruction.

```bash
git fetch origin --prune
git switch -c feature/descriptive-name origin/main
# Make and validate a focused change; inspect the diff before staging.
git diff --check
git diff
# Stage explicit paths, commit, then push the feature branch.
git push -u origin HEAD
```

Create the PR with `gh pr create --base main --head <branch> --title '<title>' --body-file <description-file>`. If authentication is unavailable, keep the local commit and run those commands after reconnecting. Never discard uncommitted work to switch branches.

## Source recheck queue and reporting tests

```bash
python3.13 -m unittest discover -s tests/python
python3.13 scripts/validate_freshness.py --report /private/tmp/hangabout-recheck-queue.json
python3.13 scripts/validate_freshness.py --strict
```

The report command exits zero while printing warnings; `--strict` exits nonzero when records are overdue. The JSON supplies IDs, source URLs, names, verification dates and ages for a genuine source-review pass. As of 2026-09-23 it contains 19 exhibitions and 22 studio/opportunity records. It is a task queue, not evidence of a new verification. Review source access conditions before fetching; a reachable page alone does not confirm all listing facts. Preserve good data and record unresolved checks rather than advancing their dates.
