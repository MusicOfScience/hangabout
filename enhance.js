'use strict';

(() => {
  const EXTRA_VENUES_URL = './data/venues-extra.json?v=5';
  const EXTRA_EVENTS_URL = './data/events-extra.json?v=5';
  const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

  async function waitForBaseApp() {
    for (let i = 0; i < 120; i += 1) {
      if (document.documentElement.dataset.hangaboutReady === 'true') return;
      await delay(50);
    }
    throw new Error('base app did not become ready');
  }

  async function fetchJson(url) {
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) throw new Error(`extra data request failed (${response.status})`);
    return response.json();
  }

  function mergeById(base, extra) {
    const map = new Map(base.map(item => [item.id, item]));
    extra.forEach(item => map.set(item.id, item));
    return [...map.values()];
  }

  function refreshVenueTypeSelect() {
    const select = $('#venueTypeSelect');
    if (!select) return;
    const current = select.value || 'all';
    select.innerHTML = '<option value="all">all spaces</option>';
    const kinds = [...new Set(state.events.map(e => venueById(e.venueId)?.kind).filter(Boolean))]
      .sort((a, b) => KIND_ORDER.indexOf(a) - KIND_ORDER.indexOf(b));
    for (const kind of kinds) {
      const option = document.createElement('option');
      option.value = kind;
      option.textContent = KIND_LABELS[kind] || kind;
      select.append(option);
    }
    if ([...select.options].some(o => o.value === current)) select.value = current;
  }

  function updateDataStamp() {
    const latest = [...state.venues, ...state.events, ...state.resources]
      .map(x => x.lastVerified)
      .filter(Boolean)
      .sort()
      .at(-1);
    const mapped = state.venues.filter(v => v.lat != null && v.lng != null).length;
    $('#dataStamp').textContent =
      `${state.events.length} listings · ${state.venues.length} art spaces · ${mapped} mapped · ${state.resources.length} make-art resources · last checked ${latest}`;
  }

  function installMakeArtDefaults() {
    state.makeKind = 'resources';
    const select = $('#makeKindSelect');
    if (select) select.value = 'resources';

    renderMake = function renderMakeEnhanced() {
      const q = norm(state.makeQuery.trim());
      const mode = state.makeKind || 'resources';

      let resources = state.resources.filter(r => !q || norm([
        r.name, r.suburb, r.summary, r.tags?.join(' '), r.availability, r.price, r.size
      ].join(' ')).includes(q));

      let venues = state.venues.filter(v => !q || norm([
        v.name, v.suburb, v.focus?.join(' '), v.artistPathways?.map(x => x.label).join(' ')
      ].join(' ')).includes(q));

      if (mode === 'resources') {
        venues = [];
      } else if (mode === 'studio') {
        resources = resources.filter(r => r.resourceType === 'studio');
        venues = [];
      } else if (mode === 'workspace') {
        resources = resources.filter(r => r.resourceType === 'workspace' || r.resourceType === 'finder');
        venues = [];
      } else if (mode === 'pathways') {
        resources = [];
        venues = venues.filter(v => v.artistPathways?.length);
      } else if (mode === 'organisations') {
        resources = [];
        venues = venues.filter(v => ['first-nations-led', 'artist-run', 'independent', 'specialist', 'contemporary-org', 'university', 'municipal'].includes(v.kind));
      } else if (mode === 'commercial') {
        resources = [];
        venues = venues.filter(v => v.kind === 'commercial');
      }

      resources.sort((a, b) => a.resourceType.localeCompare(b.resourceType) || a.name.localeCompare(b.name));
      venues.sort((a, b) => (KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind)) || a.name.localeCompare(b.name));

      const total = resources.length + venues.length;
      $('#makeCount').textContent = `${total} ${total === 1 ? 'resource' : 'resources'}`;

      const resourceCards = resources.map(resourceMakeCard);
      const venueCards = venues.map(venueMakeCard);
      $('#venueDirectory').innerHTML =
        [...resourceCards, ...venueCards].join('') ||
        '<div class="empty-state"><h3>nothing there.</h3><p>Try another make-art filter or a wider search.</p></div>';
    };

    if (state.mode === 'make') renderMake();
  }

  function installMapAreaSearch() {
    if (!state.mapAvailable || !state.map) return;

    state.areaBounds = null;
    let suppressMovePrompt = false;
    const originalFilteredEvents = filteredEvents;
    const originalFitMap = fitMap;
    const searchButton = $('#searchAreaButton');
    const clearButton = $('#clearAreaButton');
    const fitButton = $('#fitMapButton');

    filteredEvents = function filteredEventsWithArea() {
      const rows = originalFilteredEvents();
      if (!state.areaBounds) return rows;
      return rows.filter(event => {
        const venue = venueById(event.venueId);
        if (!venue || venue.lat == null || venue.lng == null) return false;
        return state.areaBounds.contains(L.latLng(venue.lat, venue.lng));
      });
    };

    fitMap = function fitMapEnhanced() {
      state.areaBounds = null;
      if (clearButton) clearButton.hidden = true;
      if (searchButton) searchButton.hidden = true;
      suppressMovePrompt = true;
      originalFitMap();
      setTimeout(() => { suppressMovePrompt = false; }, 250);
      renderResults();
    };

    if (fitButton) fitButton.onclick = fitMap;

    state.map.on('moveend', () => {
      if (suppressMovePrompt) return;
      if (searchButton) searchButton.hidden = false;
    });

    if (searchButton) {
      searchButton.onclick = () => {
        state.areaBounds = state.map.getBounds();
        renderResults();
        searchButton.hidden = true;
        if (clearButton) clearButton.hidden = false;

        const mapped = state.venues.filter(v => v.lat != null && v.lng != null).length;
        const unmapped = state.venues.length - mapped;
        $('#explorerStatus').textContent =
          `Showing listings in this map area. ${unmapped} art spaces are still list-only while coordinates are being verified.`;
      };
    }

    if (clearButton) {
      clearButton.onclick = () => {
        state.areaBounds = null;
        clearButton.hidden = true;
        $('#explorerStatus').textContent = '';
        renderResults();
        suppressMovePrompt = true;
        originalFitMap();
        setTimeout(() => { suppressMovePrompt = false; }, 250);
      };
    }
  }

  function installLocationPrompt() {
    const prompt = $('#locationPrompt');
    const useButton = $('#locationPromptUse');
    const dismissButton = $('#locationPromptDismiss');
    if (!prompt || !useButton || !dismissButton) return;

    let dismissed = false;
    try { dismissed = sessionStorage.getItem('hangabout:location-prompt-dismissed') === '1'; } catch {}
    prompt.hidden = dismissed || !!state.userLocation;

    useButton.onclick = () => {
      prompt.hidden = true;
      locate({ sort: true });
      $('#explorerStatus').textContent = 'Finding your location to sort nearby exhibitions first…';
    };

    dismissButton.onclick = () => {
      prompt.hidden = true;
      try { sessionStorage.setItem('hangabout:location-prompt-dismissed', '1'); } catch {}
    };
  }

  async function main() {
    await waitForBaseApp();

    const [extraVenues, extraEvents] = await Promise.all([
      fetchJson(EXTRA_VENUES_URL),
      fetchJson(EXTRA_EVENTS_URL),
    ]);

    state.venues = mergeById(state.venues, extraVenues);
    state.events = mergeById(state.events, extraEvents);

    refreshVenueTypeSelect();
    installMakeArtDefaults();
    installMapAreaSearch();
    installLocationPrompt();
    updateDataStamp();

    renderResults();
    renderCrawl();
    if (state.mode === 'make') renderMake();

    const mapped = state.venues.filter(v => v.lat != null && v.lng != null).length;
    const summary = $('#mappedSummary');
    if (summary && state.events.length) {
      summary.title = `${mapped} of ${state.venues.length} art spaces currently have verified map coordinates`;
    }
  }

  main().catch(err => {
    console.error('hangabout enhancement failed', err);
    if ($('#explorerStatus')) {
      $('#explorerStatus').textContent =
        'The expanded listings layer did not load; the core listings are still available.';
    }
  });
})();
