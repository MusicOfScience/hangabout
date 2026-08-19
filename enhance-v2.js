'use strict';

(() => {
  const URLS = {
    extraVenues: './data/venues-extra.json?v=6',
    extraEvents: './data/events-extra.json?v=6',
    majorVenues: './data/venues-major.json?v=6',
    majorEvents: './data/events-major.json?v=6',
    extraResources: './data/make-resources-extra.json?v=6',
  };

  const SUBURB_CENTRES = {
    'abbotsford': [-37.8024, 144.9982],
    'armadale': [-37.8562, 145.0194],
    'box hill': [-37.8197, 145.1269],
    'brighton': [-37.9050, 145.0027],
    'brunswick': [-37.7662, 144.9594],
    'brunswick east': [-37.7710, 144.9770],
    'bulleen': [-37.7660, 145.0830],
    'burwood': [-37.8500, 145.1190],
    'caulfield': [-37.8770, 145.0220],
    'caulfield east': [-37.8771, 145.0461],
    'carlton': [-37.8001, 144.9671],
    'carlton north': [-37.7840, 144.9710],
    'coburg': [-37.7422, 144.9639],
    'coburg north': [-37.7280, 144.9670],
    'collingwood': [-37.8020, 144.9880],
    'fitzroy': [-37.7990, 144.9790],
    'footscray': [-37.8008, 144.8998],
    'hawthorn': [-37.8230, 145.0359],
    'kew': [-37.8060, 145.0330],
    'melbourne': [-37.8136, 144.9631],
    'moorabbin': [-37.9340, 145.0370],
    'north melbourne': [-37.7990, 144.9550],
    'northcote': [-37.7710, 145.0000],
    'port melbourne': [-37.8330, 144.9470],
    'prahran': [-37.8510, 144.9930],
    'preston': [-37.7420, 145.0080],
    'richmond': [-37.8190, 145.0010],
    'southbank': [-37.8240, 144.9680],
    'st kilda': [-37.8670, 144.9800],
    'west melbourne': [-37.8060, 144.9490],
    'wheelers hill': [-37.9100, 145.1900],
  };

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
    if (!response.ok) throw new Error(`enhancement data request failed (${response.status})`);
    return response.json();
  }

  function mergeById(base, ...layers) {
    const map = new Map(base.map(item => [item.id, item]));
    layers.flat().forEach(item => map.set(item.id, item));
    return [...map.values()];
  }

  function addTaxonomy() {
    KIND_LABELS['major-institution'] = 'major public institution';
    if (!KIND_ORDER.includes('major-institution')) KIND_ORDER.splice(6, 0, 'major-institution');
    RESOURCE_LABELS.opportunity = 'artist opportunity';
  }

  function mappedPeersForSuburb(suburb) {
    const key = norm(suburb);
    return state.venues.filter(v => norm(v.suburb) === key && v.lat != null && v.lng != null);
  }

  function pointForVenue(venue) {
    if (!venue) return null;
    if (venue.lat != null && venue.lng != null) return [venue.lat, venue.lng];
    const peers = mappedPeersForSuburb(venue.suburb);
    if (peers.length) {
      return [
        peers.reduce((sum, v) => sum + v.lat, 0) / peers.length,
        peers.reduce((sum, v) => sum + v.lng, 0) / peers.length,
      ];
    }
    return SUBURB_CENTRES[norm(venue.suburb)] || null;
  }

  function pointForResource(resource) {
    if (resource?.lat != null && resource?.lng != null) return [resource.lat, resource.lng];
    const peers = mappedPeersForSuburb(resource?.suburb || '');
    if (peers.length) {
      return [
        peers.reduce((sum, v) => sum + v.lat, 0) / peers.length,
        peers.reduce((sum, v) => sum + v.lng, 0) / peers.length,
      ];
    }
    return SUBURB_CENTRES[norm(resource?.suburb || '')] || null;
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
      `${state.events.length} listings · ${state.venues.length} art spaces · ${mapped} exact pins · ${state.resources.length} make-art resources · last checked ${latest}`;
  }

  function installAreaSearch() {
    if (!state.mapAvailable || !state.map) return;

    const baseFilteredEvents = filteredEvents;
    const baseFitMap = fitMap;
    const searchButton = $('#searchAreaButton');
    const clearButton = $('#clearAreaButton');
    const fitButton = $('#fitMapButton');
    let suppressMovePrompt = false;
    state.areaBounds = null;

    filteredEvents = function filteredEventsGeographic() {
      const requestedQuick = state.quick;
      if (requestedQuick === 'nearby') state.quick = 'all';
      let rows;
      try {
        rows = baseFilteredEvents();
      } finally {
        state.quick = requestedQuick;
      }

      if (requestedQuick === 'nearby') {
        rows = rows.filter(event => {
          const point = pointForVenue(venueById(event.venueId));
          return !!(state.userLocation && point && haversine(state.userLocation, point) <= 5);
        });
      }

      if (state.areaBounds) {
        rows = rows.filter(event => {
          const point = pointForVenue(venueById(event.venueId));
          return !!(point && state.areaBounds.contains(L.latLng(point[0], point[1])));
        });
      }

      if (state.sort === 'distance' && state.userLocation) {
        rows.sort((a, b) => {
          const pa = pointForVenue(venueById(a.venueId));
          const pb = pointForVenue(venueById(b.venueId));
          const da = pa ? haversine(state.userLocation, pa) : Infinity;
          const db = pb ? haversine(state.userLocation, pb) : Infinity;
          return da - db || a.title.localeCompare(b.title);
        });
      }
      return rows;
    };

    fitMap = function fitMapAll() {
      state.areaBounds = null;
      if (clearButton) clearButton.hidden = true;
      if (searchButton) searchButton.hidden = true;
      suppressMovePrompt = true;
      renderResults();
      baseFitMap();
      setTimeout(() => { suppressMovePrompt = false; }, 300);
      $('#explorerStatus').textContent = '';
    };

    if (fitButton) fitButton.onclick = fitMap;

    state.map.on('moveend', () => {
      if (!suppressMovePrompt && searchButton) searchButton.hidden = false;
    });

    if (searchButton) {
      searchButton.onclick = () => {
        state.areaBounds = state.map.getBounds();
        searchButton.hidden = true;
        if (clearButton) clearButton.hidden = false;
        renderResults();
        $('#explorerStatus').textContent =
          'Showing this map area. List-only venues are included by suburb; map pins remain exact-coordinate only.';
      };
    }

    if (clearButton) {
      clearButton.onclick = () => {
        state.areaBounds = null;
        clearButton.hidden = true;
        if (searchButton) searchButton.hidden = true;
        $('#explorerStatus').textContent = '';
        renderResults();
        suppressMovePrompt = true;
        baseFitMap();
        setTimeout(() => { suppressMovePrompt = false; }, 300);
      };
    }
  }

  function installLocationPrompt() {
    const prompt = $('#locationPrompt');
    const useButton = $('#locationPromptUse');
    const dismissButton = $('#locationPromptDismiss');
    if (!prompt || !useButton || !dismissButton) return;

    prompt.hidden = !!state.userLocation;
    useButton.onclick = () => {
      prompt.hidden = true;
      $('#explorerStatus').textContent = 'Finding your location to put nearby exhibitions first…';
      locate({ sort: true });
    };
    dismissButton.onclick = () => { prompt.hidden = true; };
  }

  function makeClusterIcon(count, active = false) {
    return L.divIcon({
      className: 'make-cluster-wrap',
      html: `<span class="make-cluster${active ? ' is-active' : ''}">${count}</span>`,
      iconSize: [36, 36],
      iconAnchor: [18, 18],
    });
  }

  function ensureMakeMap() {
    if (state.makeMap || !window.L || !$('#makeMap')) return;
    state.makeMap = L.map('makeMap', { zoomControl: true, scrollWheelZoom: false }).setView(MELBOURNE, 11);
    L.tileLayer(OSM_TILE_URL, { maxZoom: 19, attribution: '&copy; OpenStreetMap contributors' }).addTo(state.makeMap);
    state.makeMarkerLayer = L.layerGroup().addTo(state.makeMap);
    state.makeLocationLayer = null;
  }

  function updateMakeMap(resources, venues) {
    ensureMakeMap();
    if (!state.makeMap || !state.makeMarkerLayer) return;
    state.makeMarkerLayer.clearLayers();

    const groups = new Map();
    const add = (suburb, point, name) => {
      if (!point || !suburb) return;
      const key = norm(suburb);
      if (!groups.has(key)) groups.set(key, { suburb, point, names: [] });
      groups.get(key).names.push(name);
    };
    resources.forEach(r => add(r.suburb, pointForResource(r), r.name));
    venues.forEach(v => add(v.suburb, pointForVenue(v), v.name));

    const markers = [];
    for (const group of groups.values()) {
      const marker = L.marker(group.point, {
        icon: makeClusterIcon(group.names.length, norm(state.makeAreaSuburb || '') === norm(group.suburb)),
        title: `${group.suburb}: ${group.names.length} resources`,
      }).addTo(state.makeMarkerLayer);
      marker.bindPopup(`<strong>${esc(group.suburb)}</strong><br>${group.names.slice(0, 5).map(esc).join('<br>')}${group.names.length > 5 ? '<br>…' : ''}<br><em>area marker</em>`);
      marker.on('click', () => {
        state.makeAreaSuburb = group.suburb;
        renderMake();
      });
      markers.push(marker);
    }

    if (markers.length && !state.makeAreaSuburb) {
      const bounds = L.featureGroup(markers).getBounds();
      if (bounds.isValid()) state.makeMap.fitBounds(bounds.pad(.15), { maxZoom: 12 });
    }
    requestAnimationFrame(() => state.makeMap?.invalidateSize());
  }

  function installMakeArt() {
    state.makeKind = 'resources';
    state.makeAreaSuburb = null;
    const select = $('#makeKindSelect');
    if (select) select.value = 'resources';

    renderMake = function renderMakeMapNative() {
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
      } else if (mode === 'opportunity') {
        resources = resources.filter(r => r.resourceType === 'opportunity');
        venues = [];
      } else if (mode === 'pathways') {
        resources = [];
        venues = venues.filter(v => v.artistPathways?.length);
      } else if (mode === 'organisations') {
        resources = [];
        venues = venues.filter(v => ['first-nations-led','artist-run','independent','specialist','contemporary-org','university','municipal','major-institution'].includes(v.kind));
      } else if (mode === 'commercial') {
        resources = [];
        venues = venues.filter(v => v.kind === 'commercial');
      }

      const mapResources = [...resources];
      const mapVenues = [...venues];
      if (state.makeAreaSuburb) {
        const area = norm(state.makeAreaSuburb);
        resources = resources.filter(r => norm(r.suburb) === area);
        venues = venues.filter(v => norm(v.suburb) === area);
      }

      resources.sort((a, b) => a.resourceType.localeCompare(b.resourceType) || a.name.localeCompare(b.name));
      venues.sort((a, b) => (KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind)) || a.name.localeCompare(b.name));

      const total = resources.length + venues.length;
      $('#makeCount').textContent = `${total} ${total === 1 ? 'resource' : 'resources'}`;
      $('#venueDirectory').innerHTML = [
        ...resources.map(resourceMakeCard),
        ...venues.map(venueMakeCard),
      ].join('') || '<div class="empty-state"><h3>nothing there.</h3><p>Try another filter, suburb or search.</p></div>';

      const status = $('#makeMapStatus');
      const reset = $('#makeMapResetButton');
      if (state.makeAreaSuburb) {
        if (status) status.textContent = `${state.makeAreaSuburb} · area marker selected. Exact addresses are in the cards.`;
        if (reset) reset.hidden = false;
      } else {
        if (status) status.textContent = 'Map markers group make-art resources by suburb unless an exact point is verified.';
        if (reset) reset.hidden = true;
      }
      updateMakeMap(mapResources, mapVenues);
    };

    const reset = $('#makeMapResetButton');
    if (reset) reset.onclick = () => { state.makeAreaSuburb = null; renderMake(); };

    const locateButton = $('#makeLocateButton');
    if (locateButton) {
      locateButton.onclick = () => {
        const status = $('#makeMapStatus');
        if (!navigator.geolocation) {
          if (status) status.textContent = 'Location is not available in this browser.';
          return;
        }
        if (status) status.textContent = 'Finding your location…';
        navigator.geolocation.getCurrentPosition(pos => {
          state.userLocation = [pos.coords.latitude, pos.coords.longitude];
          ensureMakeMap();
          if (state.makeLocationLayer) state.makeLocationLayer.remove();
          state.makeLocationLayer = L.circleMarker(state.userLocation, { radius: 7, weight: 2 })
            .addTo(state.makeMap)
            .bindTooltip('you are here');
          state.makeMap.setView(state.userLocation, 12);
          if (status) status.textContent = 'Location found. Area markers show where the make-art resources are clustered.';
        }, () => {
          if (status) status.textContent = 'Location permission was not available.';
        });
      };
    }
  }

  async function main() {
    await waitForBaseApp();
    addTaxonomy();

    const [extraVenues, extraEvents, majorVenues, majorEvents, extraResources] = await Promise.all([
      fetchJson(URLS.extraVenues),
      fetchJson(URLS.extraEvents),
      fetchJson(URLS.majorVenues),
      fetchJson(URLS.majorEvents),
      fetchJson(URLS.extraResources),
    ]);

    state.venues = mergeById(state.venues, extraVenues, majorVenues);
    state.events = mergeById(state.events, extraEvents, majorEvents);
    state.resources = mergeById(state.resources, extraResources);

    refreshVenueTypeSelect();
    installAreaSearch();
    installMakeArt();
    installLocationPrompt();
    updateDataStamp();

    renderResults();
    renderCrawl();
    if (state.mode === 'make') renderMake();

    const summary = $('#mappedSummary');
    const exact = state.venues.filter(v => v.lat != null && v.lng != null).length;
    if (summary) summary.title = `${exact} exact venue pins; list-only venues can still participate in area search by suburb.`;
    document.documentElement.dataset.hangaboutV6Ready = 'true';
  }

  main().catch(err => {
    console.error('hangabout enhancement failed', err);
    if ($('#explorerStatus')) {
      $('#explorerStatus').textContent = 'The expanded discovery layer did not load; the core listings are still available.';
    }
  });
})();
