# Hangabout v1 hostile review

Date: 28 October 2026

Status: **code/data release gates addressed; deployed smoke test remains required before tagging v1.0.0.**

This review asks whether Hangabout can mislead a user even when its interface appears to work. Passing CI is necessary but not sufficient: live dates, hours, booking states, source conflicts and external-service failures are all places where a technically functioning arts app can confidently give bad advice.

## Findings resolved during the v1 pass

### 1. Exhibition and event were the same object

The prototype `Event` record was structurally an exhibition with an optional embedded opening. It could not cleanly represent workshops, talks, tours, screenings, performances or standalone programmes.

**Resolution:** date-range `Exhibition` and timed `ProgrammeEvent` are separate canonical concepts. Existing IDs/UI were migrated through a compatibility alias rather than a rewrite.

### 2. Discovery evidence could have become publication authority

A public calendar is extremely useful for finding that something exists, but parsing a record does not prove venue identity, exhibition linkage, exact type or redistribution permission.

**Resolution:** external data first becomes a loss-minimising `SourceObservation`. Calendar UID, raw timezone-bearing DTSTART/DTEND fields, location, status and payload identity are preserved. Entity resolution produces match/review/unresolved output and does not auto-publish.

### 3. First-party sources and discovery calendars can disagree

Real review found cases where a discovery calendar and the official venue source disagreed on event time.

**Resolution:** first-party venue/institution evidence wins for canonical dates, times, booking and practical facts. The conflicting discovery observation remains useful provenance rather than being silently discarded.

### 4. Workshops require different semantics from exhibitions

A workshop has a facilitator, capacity/booking state, possibly a fee, materials and an intended audience. Calling every named participant an artist loses meaning.

**Resolution:** timed programme events support named people with roles, registration/capacity state, price, audience and materials notes. The Jodi Wiley workshop case was used to stress-test the model.

### 5. Unknown duration was vulnerable to helpful invention

An event source may publish a start time without an end time.

**Resolution:** no default duration is invented. Browser regression coverage verifies that a known start with unknown end remains an unknown end.

### 6. Empty programme states could overclaim absence

A sparse maintained catalogue must not tell a user that nothing is happening in Melbourne.

**Resolution:** empty states say nothing is currently **verified** in Hangabout's maintained coverage and explicitly note that coverage is incomplete.

### 7. A future event could become stale before it happened

A timed event can remain in the future while its booking state, start time or cancellation evidence has gone unverified for weeks.

**Resolution:** timed programme items leave the live surface once their 14-day verification deadline passes, even if the scheduled event date is still ahead. A browser regression advances Melbourne time beyond the deadline and verifies fail-closed behaviour.

### 8. Old venue hours could continue answering “open now”

Stored opening hours are historical evidence, not an indefinitely valid live claim.

**Resolution:** once venue verification is older than the live-hours review window, hours remain stored but are projected as unverified and stop driving open-now/open-today answers.

### 9. Stale exhibitions were too visible

The historical catalogue is useful, but a stale date-range record should not present as a current recommendation merely because its nominal end date has not passed.

**Resolution:** stale exhibitions remain in the archive/data layer but leave the live discovery catalogue until reverified.

### 10. Studio history and current vacancy were conflated

A studio premise can continue to exist after a vacancy listing expires.

**Resolution:** durable premises and volatile vacancy observations are separate. Historical availability can remain visible as **previously listed**, while the **available now** filter fails closed on stale evidence.

### 11. Mobile Safari exposed a Leaflet state race

A duplicate `moveend` for an unchanged viewport could overwrite a meaningful live-discovery error with the generic “map moved” prompt before the user could see it.

**Resolution:** a settled search viewport is keyed; duplicate move events for that viewport no longer erase completed success/error state. Existing mobile-Safari recovery tests pass unchanged.

### 12. Map failure must not become application failure

Live OpenStreetMap discovery and raster tiles are external dependencies.

**Resolution:** map and live discovery remain progressive enhancement. Exhibition/programme lists, detail, source evidence and address-based navigation survive external discovery failure. Standard OpenStreetMap raster use remains low-volume, attributed and replaceable if traffic grows.

### 13. Deployment validation lagged behind PR validation

The pull-request gate learned about timed programme validation, source review and known-place validation before the GitHub Pages workflow did.

**Resolution in release candidate:** the Pages verify/build job runs the same critical Python regressions, programme/data/source/coordinate/geography validators, review fixture, freshness audit, browser regressions and production build before deployment.

### 14. Search semantics can surprise narrow tests

Searching `workshop` correctly returned an Australian Print Workshop event because global programme search includes venue names as well as event type/title.

**Resolution:** preserve useful global-search behaviour and correct the over-narrow regression rather than changing the product to satisfy the test.

## Source and rights boundary

Charles Art Openings is registered as **reference-only**. Public visibility/subscription is not treated as permission for permanent automated redistribution. It can inform manual discovery and corroboration; scheduled ingestion should wait for permission.

Artwork images and protected exhibition copy remain outside the critical ingestion path without a rights/licensing model.

## Make-art review

The freshness audit still contains historical studio/workspace/opportunity records. That is not itself a release blocker because the UI distinguishes stale context from current availability and the current-availability filter is conservative. The product must not represent stale vacancy evidence as currently available.

## Release assessment

At code/data level, the v1 review has no known unresolved P0/P1 issue. Before `v1.0.0` is tagged, the following still must be true on the final release commit:

1. pull-request validation passes;
2. the stricter GitHub Pages verify/build/deploy workflow succeeds;
3. the deployed application receives a smoke check for load, exhibition list, timed programme, mobile interaction and map fail-soft behaviour;
4. package/release metadata identifies the release as `1.0.0`.

If any of those fail, the tag waits. The version number is not a reason to waive a truthfulness or deployment failure.
