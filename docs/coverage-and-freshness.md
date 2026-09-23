# Coverage and freshness decision

## What “checked” means

`lastVerified` records the date a human or approved adapter checked the factual listing against its named source. The existing Monday discovery workflow only finds candidate first-party programme links for review; it does not silently promote them into the live guide.

The public interface therefore shows both the calendar date and the age of each make-art check, and asks people to confirm volatile availability at the source before travelling, applying or paying.

## Review cadence

These are review targets, not a claim that a source has changed:

| Record | Review target | Freshness warning age | Why |
| --- | ---: | ---: | --- |
| Current/upcoming exhibitions | weekly | 14 days | dates, cancellations and programme pages change |
| Studios and opportunities | weekly | 14 days | vacancies, prices and deadlines are volatile |
| Shared workspaces and finders | monthly | 60 days | services are steadier but can close or change terms |
| Venue registry and hours | monthly/quarterly | 90 days | addresses and hours change less often |

`scripts/validate_freshness.py` reports records beyond these review ages and writes a source-linked recheck queue. The normal audit is deliberately non-blocking: stale records remain visible with uncertainty or are excluded from current-availability results by the application. Use `--strict` for a deliberate data-maintenance check when a catalogue refresh is being reviewed. Malformed data and application-integrity failures remain release blockers. Weekly discovery remains a review queue; first-party adapters can later reduce manual work where automation is authorised.

## Geographic expansion

Historical staging recommendation below. The current national milestone and implementation sequence are in [NATIONAL_DISCOVERY_PLAN.md](NATIONAL_DISCOVERY_PLAN.md); studios remain Melbourne-only. The freshness limits above remain in force.

### Recommendation

Expand to Victoria before attempting national coverage. The statewide known-place layer is already useful for discovering regional gaps, but those markers are not a claim that current programmes have been ingested. Add verified programmes region by region and show the coverage boundary honestly.

### Victoria phase

1. Add `countryCode`, `stateCode`, `locality`, `region` and `timeZone` to venues and make-art resources.
2. Replace Melbourne suburb-centre assumptions with a region registry and explicit coverage selector.
3. Start with Geelong, Ballarat, Bendigo and regional public galleries, then add independent and artist-run spaces.
4. Require the same provenance and freshness gates as Melbourne before a region is labelled covered.
5. Move to a production-appropriate map tile service before wider traffic.

### Australia phase

National scope should follow only after the Victoria ingestion and review loop is sustainable. It requires per-record timezones, state/territory filters, national map clustering, performance work, and an authorised first-party source registry for each region. Melbourne-only time logic in `src/time.ts` must become venue-time logic before interstate “open now”, date and opening filters can be trusted.

The product should distinguish three states: **covered** (current programmes are maintained), **known place** (the place exists but its programme is not ingested), and **outside current coverage**. More pins without that distinction would make the guide look national before it is reliable.
