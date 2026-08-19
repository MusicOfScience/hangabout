# hostile review — v0

This document records the decisions that survived the first adversarial review of `hangabout` before merge.

## verdict

The core proposition survives: **see art** and **make art** belong in the same service, and map + list is the right primary discovery surface. The initial implementation did not survive unchanged. Several behaviours sounded more certain or intelligent than the underlying data justified.

## release blockers found and resolved

### 1. time semantics were misleading

The first build treated “today” as “the exhibition date range includes today”, even when the venue was closed. “Open now” could also report a venue as closed when its hours were simply absent.

**Decision:** Melbourne time is explicit. Open-now, open-today and weekend filters only use first-party-verified venue hours. Missing hours are labelled **unverified**, never inferred as closed.

### 2. the crawl overclaimed intelligence

The first route used a nearest-neighbour approximation, hard-coded driving, ignored opening hours and allowed multiple selected exhibitions at one venue to create duplicate stops.

**Decision:** keep the useful interaction but describe it accurately. One stop per venue, approximate proximity ordering, selectable transport mode, address-based handoff to Google Maps, and an explicit instruction to check hours. It is not presented as an optimal itinerary.

### 3. location filters failed silently

“Near me” could show every listing before location permission existed; nearest sorting could degrade into suburb sorting after denial.

**Decision:** location-dependent controls activate only after successful geolocation. Denial returns the UI to a non-location state and explains what happened through a status message.

### 4. venue taxonomy was not a taxonomy

Strings such as `artist-run / specialist` mixed governance, business model and artistic focus in one field.

**Decision:** use a controlled venue-kind enum and keep focus tags separate. Current kinds are `artist-run`, `commercial`, `contemporary-org`, `first-nations-led`, `independent`, `municipal`, `specialist` and `university`.

### 5. provenance was too weak

A generic “source: Art Almanac / venue data” note hid the difference between a first-party listing and a directory listing.

**Decision:** each event carries source name, source type, source URL and verification date. The UI labels official vs directory sources. First-party data is preferred for hours, access and artist pathways.

### 6. seed-data errors proved the need for the model

The review caught material inaccuracies in the seed corpus, including an expired Firestation Print Studio exhibition being presented as current and an incorrect ACCA start date.

**Decision:** remove/correct the records, deepen first-party verification, and make deployment depend on a reusable data validator. “More listings” is not a success metric if confidence falls.

### 7. map availability was a single point of failure

The first boot path assumed Leaflet loaded successfully. A CDN failure could break the whole application.

**Decision:** map is progressive enhancement. List, filtering, detail and address-based navigation continue without it. Venues can also exist without verified coordinates and are counted honestly as unmapped.

### 8. accessibility had interaction noise

The map had `role="application"`; every result card was an additional focus stop around already-focusable controls; the entire results list was live-announced on filter changes; hover could call `scrollIntoView`.

**Decision:** remove the application role and card tabindex, keep live announcements on the compact results summary, never scroll the list on hover/focus, retain visible global focus treatment, and keep the detail dialog keyboard-operable.

### 9. artist-facing mode was too vague

The first `make art` cards offered generic phrases such as “represented artists” without distinguishing a verified application/proposal route from descriptive metadata.

**Decision:** `artistPathways` are explicit official links. If no pathway has been checked, the UI says **no verified artist pathway yet**. Search, venue-kind filtering and a pathway-only filter make the directory useful rather than ornamental.

### 10. deployment could bypass validation

The original Pages job could deploy independently of the validation workflow and uploaded the entire repository directory.

**Decision:** the deployment workflow now runs its own verify gate, stages only production static assets into `_site`, then deploys. PR validation remains separate for fast review feedback.

## deliberately not added

- artwork thumbnails without a rights model
- scraping of Ocula or other third-party services
- user accounts
- AI recommendations
- a service worker / offline claim
- push notifications
- a backend
- “smart” opening-hours itinerary optimisation

Those may become sensible later. None are required to validate the core service now.

## acceptance test for the next phase

A new feature should answer at least one of these better than the existing web does: **what can I see, can I see it when I plan to go, what is near it, how do I get there, or how can an artist engage with the space?** If it cannot, it is probably product ornament.
