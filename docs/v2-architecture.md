# hangabout v2 — controlled rebuild

v2 preserves the source, data and validation work from the prototype while replacing the layered browser architecture.

## Why rebuild the frontend

The prototype accumulated `app.js`, `enhance.js`, `enhance-v2.js` and `coordinates.js`. Each patch was defensible, but runtime behaviour became distributed across override layers. v2 makes state and rendering explicit and typed.

## Kept

- canonical venue, event and make-art source files
- source provenance and source-policy guardrails
- first-party index discovery workflow
- coordinate provenance overlay
- GitHub Pages
- Melbourne-time semantics
- see-art / make-art product split
- no account/backend requirement

## New application boundaries

- `src/data/load.ts` — canonical merge/normalisation
- `src/time.ts` — Melbourne date/opening semantics
- `src/geo.ts` — exact points, suburb fallback geography, distances
- `src/map.ts` — Leaflet controllers only
- `src/discovery.ts` — navigation and user-triggered web discovery
- `src/state.ts` — one explicit app state
- `src/main.ts` — DOM wiring and rendering
- `src/styles.css` — one visual system

## Geographic semantics

A visible venue pin requires stored coordinates. Area search may include an unpinned venue using a suburb centroid; the result count explicitly distinguishes exact pins from area-matched spaces.

Web discovery is user-triggered and constructs ordinary Google Search queries for the current map area. It does not scrape Google or ingest search-result content.

## Deployment

Vite builds a static `dist/` directory. No runtime server is introduced. V2 is the canonical application on `main` and deploys at `/hangabout/`; the former `/hangabout/v2/` path is retained only as a target-preserving redirect.

The prototype override files were removed when v2 became canonical. Interaction regressions are covered in desktop-Chrome and mobile-Safari Playwright projects before Pages deployment.
