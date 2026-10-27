# Hangabout v1 release contract

## Product promise

> **Hangabout v1 is a Melbourne-first, source-backed art discovery service that helps people discover exhibitions and timed art programmes happening now and soon, understand where and when they can attend them, find nearby art spaces, and discover ways to engage with those spaces as artists. It favours verified, attributable and explicitly incomplete information over apparently comprehensive but unreliable listings.**

## Required before v1.0

### Data integrity

- Exhibition and timed programme event are distinct canonical concepts.
- Canonical timed events reference known venues and only reference an exhibition when the relationship is supported.
- First-party source data wins when sources disagree.
- Unknown facts remain absent/unknown rather than inferred.
- Stale exhibitions do not present on the live discovery surface.
- External source observations do not auto-publish merely because they parse or entity-match.

### Melbourne discovery

A user must be able to:

- see source-backed current/upcoming exhibitions;
- inspect what is happening soon as timed programme items;
- distinguish opening/talk/tour/workshop/etc. from a date-range exhibition;
- search/filter without timed programme and exhibition semantics becoming conflated;
- understand venue, date/time, admission/price, booking status and practical notes where known;
- follow an official/source link for evidence and current details;
- use the map/list even when live discovery or external services fail.

### Reliability

The release candidate must pass:

- Python tooling/tests;
- layered data validation;
- timed programme validation;
- coordinate/source/geography validation;
- freshness audit;
- strict TypeScript typecheck;
- desktop and mobile browser regressions;
- production build.

The final hostile review must explicitly test contradictory sources, cancellations, unknown end times, stale records, unknown venues, accessibility/programme variants, mobile layout and external-service failures.

## Explicitly not required for v1

- national coverage;
- user accounts;
- social features;
- recommendation AI;
- push notifications;
- native applications;
- offline/PWA support;
- artwork-image ingestion;
- a persistent application backend;
- optimal multi-stop routing.

## Operational stance

- GitHub Actions + reviewed static data + static deployment remain acceptable for v1.
- OpenStreetMap standard raster tiles are acceptable for ordinary low-volume interactive viewing while Hangabout complies with attribution/no-bulk-use requirements; provider migration becomes an operational issue if traffic or use patterns grow.
- Reference directories/calendars are not treated as redistribution licences.

## Release gate

Tag `v1.0.0` only after all release PRs are merged, `main` is green, the deployed app is smoke-tested, the hostile review has no unresolved P0/P1 findings, and `package.json`/release notes describe the released product rather than the prototype roadmap.
