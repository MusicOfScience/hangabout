'use strict';

(() => {
  const COORDINATES_URL = './data/venue-coordinates.json?v=7';
  const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

  async function waitForRegistry() {
    for (let i = 0; i < 160; i += 1) {
      if (
        typeof state !== 'undefined' &&
        Array.isArray(state.venues) &&
        state.venues.some(v => v.id === 'gallery-unbound') &&
        state.venues.some(v => v.id === 'ngv-international')
      ) return;
      await delay(50);
    }
    throw new Error('expanded venue registry did not become ready');
  }

  async function fetchJson(url) {
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) throw new Error(`coordinate request failed (${response.status})`);
    return response.json();
  }

  function updateStamp() {
    const stamp = document.querySelector('#dataStamp');
    if (!stamp) return;
    const latest = [...state.venues, ...state.events, ...state.resources]
      .map(item => item.lastVerified)
      .filter(Boolean)
      .sort()
      .at(-1);
    const mapped = state.venues.filter(v => v.lat != null && v.lng != null).length;
    stamp.textContent = `${state.events.length} listings · ${state.venues.length} art spaces · ${mapped} exact pins · ${state.resources.length} make-art resources · last checked ${latest}`;
  }

  async function main() {
    await waitForRegistry();
    const coordinates = await fetchJson(COORDINATES_URL);
    const venues = new Map(state.venues.map(v => [v.id, v]));

    for (const record of coordinates) {
      const venue = venues.get(record.venueId);
      if (!venue) continue;
      venue.lat = record.lat;
      venue.lng = record.lng;
      venue.coordinatePrecision = record.precision;
      venue.coordinateSourceUrl = record.sourceUrl;
      venue.coordinateVerified = record.lastVerified;
    }

    if (typeof renderResults === 'function') renderResults();
    if (state.mode === 'make' && typeof renderMake === 'function') renderMake();
    updateStamp();

    const summary = document.querySelector('#mappedSummary');
    if (summary) {
      const mapped = state.venues.filter(v => v.lat != null && v.lng != null).length;
      summary.title = `${mapped} of ${state.venues.length} art spaces currently have exact map coordinates`;
    }
  }

  main().catch(error => {
    console.error('hangabout coordinate overlay failed', error);
  });
})();
