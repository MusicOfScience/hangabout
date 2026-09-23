# Hangabout

Hangabout is my existing art-discovery application.

- Repository: https://github.com/MusicOfScience/hangabout
- Expected local working folder: github/hangabout on my computer. Verify the actual absolute path rather than assuming it.
- Verified local path when these instructions were saved: `/Users/hudson/Documents/GitHub/hangabout`.
- Last reported production URL: https://musicofscience.github.io/hangabout/

## Purpose

Help people discover galleries and exhibitions through “see art”, and studios and practical artist resources through “make art”. Preserve the app’s editorial identity, plain-English controls and mobile usability.

## Scope

Extend gallery and exhibition discovery nationally across Australia, including regional areas. Develop a maintainable indexing and refresh pipeline that discovers new galleries, links them to sourced exhibition programmes and supports geographic search.

Keep studio discovery focused on inner and outer Melbourne.

## Working method

- Work in the local repository. Inspect existing instructions, code, Git status, branches, workflows and documentation before changing anything. Preserve uncommitted work.
- Use the current repository and deployment configuration as evidence. Treat chat summaries as historical handover, not proof of current implementation.
- Do not recreate the application or revive an obsolete branch.

## Git and release workflow

- Use focused feature branches and reviewable commits.
- You may push feature branches and open pull requests when connectivity and authentication permit. I review and merge PRs in GitHub.
- Do not push directly to main, merge PRs, enable auto-merge or deploy production unless I explicitly request it.
- Inspect workflow triggers before pushing so a feature branch cannot unexpectedly deploy production.
- Never force-push, discard my changes or commit credentials.

## Local development

- Keep installation, preview, validation and testing reproducible and documented.
- Support development and deterministic tests using local fixtures and cached data. Separate live ingestion from offline tests. Explain which operations need internet.
- Do not introduce paid services or change hosting without discussing the concrete proposal and costs.

## Data integrity

- Keep gallery identity, exhibition records and studio availability distinct.
- Record source URLs, provenance, verification dates, geographic accuracy and freshness.
- Distinguish discovered candidates from verified records. A directory or map result does not establish a current exhibition.
- Never invent dates, coordinates, prices, facilities or availability. Unknown is different from no.
- Use stable identifiers, deduplication, appropriate Australian timezones, sensible refresh intervals and explicit stale/failed-check states.
- Respect source access conditions and rate limits. Failed fetches must not erase good data or falsely update verification dates.

## Quality

- Preserve deep links, browser history, timezone-safe dates, saved items, map/list navigation, search-area refresh and mobile map layout.
- Run relevant data validators, typechecking, production builds and desktop/mobile regression tests.
- Fix failures without weakening meaningful assertions or silently bypassing gates.
- Distinguish passing, failing and unrun checks. Do not claim something is live without verifying deployment.

## Continuity and communication

- Keep durable instructions in AGENTS.md and maintain concise checked-in handover, development and architecture documentation.
- Explain outcomes, important decisions and genuine blockers in plain English.
- Complete authorised work without repeatedly asking permission for routine reversible steps.
- At handover, report changes, tests, remaining limitations, branch/commit and PR link where available.

## Development continuity

- Read `docs/HANDOVER.md`, `docs/LOCAL_DEVELOPMENT.md` and `docs/NATIONAL_DISCOVERY_PLAN.md` when resuming work; recheck Git and remote state before relying on their dated findings.
- Use Node 22, Python 3.13 and the committed npm lockfile (`npm ci`). Keep browser fixtures deterministic and live source ingestion separate.
- Prefer scheduled ingestion producing reviewed static indexes on the existing GitHub Pages hosting before proposing a separate hosted API. Discuss concrete service costs before adoption.
- The setup/handover milestone does not authorise a major backend implementation. Deliver that as a subsequent focused change.
