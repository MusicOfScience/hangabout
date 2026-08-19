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

**Decision:** keep the useful interaction but describe it accurately. One stop per venue, approximate proximity ordering, address-based handoff to Google Maps, walking/cycling/driving for multi-stop crawls, and an explicit instruction to check hours. Public transport remains a single-destination navigation choice rather than a falsely supported multi-stop optimiser.

### 3. location filters failed silently

“Near me” could show every listing before location permission existed; nearest sorting could degrade into suburb sorting after denial.

**Decision:** location-dependent controls activate only after successful geolocation. Denial returns the UI to a non-location state and explains what happened through a status message.

### 4. venue taxonomy was not a taxonomy

Strings such as `artist-run / specialist` mixed governance, business model and artistic focus in one field.

**Decision:** use a controlled venue-kind enum and keep focus tags separate. Current kinds are `artist-run`, `commercial`, `contemporary-org`, `first-nations-led`, `independent`, `municipal`, `specialist` and `university`.

### 5. provenance was too weak

A generic “source: Art Almanac / venue data” note hid the difference between a first-party listing and a directory listing.

**Decision:** each event carries source name, source type, source URL and verification date. The UI labels official vs directory sources. First-party data is preferred for hours, access and artist pathways.

### 6. the review itself can be wrong

The first hostile pass correctly caught an incorrect ACCA start date, but it also incorrectly removed Firestation Print Studio’s *Undercurrents* after conflating it with the preceding exhibition, which ended on 15 August. A second first-party check showed *Undercurrents* actually runs 19 August–5 September 2026.

**Decision:** an adversarial review is not evidence by itself. Exact first-party event pages outrank inference, snippets and memory. The Firestation record was restored from its official 2026 calendar, the ACCA record was corrected, and deployment depends on a reusable data validator. “More listings” is not a success metric if confidence falls, but neither is aggressive deletion without source-level verification.

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

### 11. edge cases must match ordinary language

A second logic pass caught two calendar semantics that were technically plausible but user-hostile: on a Sunday, “this weekend” jumped forward to the following weekend, and an opening-event filter kept showing an opening after its event time had already ended that day.

**Decision:** Sunday belongs to the weekend currently in progress, same-day opening events expire after their listed end time, and an opening happening today can take precedence over a later formal exhibition start date in the status label. These semantics are now unit-tested.

### 12. free entry is not a default

The first seed set inherited `free: true` too broadly, including directory-sourced listings and first-party pages that did not explicitly state admission.

**Decision:** admission is `free`, `paid` or `unknown`. `free` is only asserted where a first-party source explicitly supports it; otherwise the UI says unknown and the free filter stays conservative.

### 13. navigation handoff must respect provider limits

The first revision offered public transport as a multi-stop crawl mode. Google Maps URLs support transit as a travel mode, but intermediate waypoints are not consistently supported across products and platforms, and Google’s routing documentation excludes transit waypoints in its directions service.

**Decision:** the v0 multi-stop crawl offers walking, cycling and driving only. Single-destination Google Maps links do not force a mode, so the user can choose public transport there. `hangabout` will not label an unreliable multi-stop PT handoff as a functioning route planner.

### 14. the map backend is prototype infrastructure

The first shell used Leaflet against a legacy-style OpenStreetMap subdomain template. The current OSM tile policy specifies the canonical standard-tile URL and makes clear that the community-funded tile service is best-effort rather than production infrastructure for heavy use.

**Decision:** use the canonical OSM tile URL, keep visible attribution, make the tile endpoint a single replaceable constant, and treat this service as low-volume prototype infrastructure only. A real traffic or offline requirement triggers a provider/self-host decision rather than silent load growth.

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
