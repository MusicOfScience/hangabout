import './styles.css';

import { loadDataset } from './data/load';
import { state } from './state';
import type { Dataset, Event, MakeResource, Venue } from './types';
import { closesWithin, formatDateRange, intersectsThisWeekend, isEventCurrent, isEventUpcoming, isVenueOpenNow, isVenueOpenToday, melbourneLabel, openingWithin } from './time';
import { haversine, nearestSuburb, resourcePoint, venuePoint, type Point } from './geo';
import { googleCrawlUrl, googleSearchUrl, mapsUrl, pointInsideBounds, type WebDiscoveryKind } from './discovery';
import { MakeMap, SeeMap } from './map';
import { writeIds } from './storage';
import { resourceFreshness } from './freshness';

const dataset = loadDataset();
const venueById = new Map(dataset.venues.map(venue => [venue.id, venue]));

document.querySelector<HTMLDivElement>('#app')!.innerHTML = shell(dataset);

const els = {
  skipLink: q<HTMLAnchorElement>('.skip-link'),
  seeTab: q<HTMLButtonElement>('[data-mode="see"]'),
  makeTab: q<HTMLButtonElement>('[data-mode="make"]'),
  seePanel: q<HTMLElement>('#seePanel'),
  makePanel: q<HTMLElement>('#makePanel'),
  search: q<HTMLInputElement>('#searchInput'),
  quick: q<HTMLElement>('#quickFilters'),
  kind: q<HTMLSelectElement>('#venueKind'),
  sort: q<HTMLSelectElement>('#sortMode'),
  status: q<HTMLElement>('#status'),
  results: q<HTMLElement>('#resultsList'),
  resultCount: q<HTMLElement>('#resultCount'),
  mappedCount: q<HTMLElement>('#mappedCount'),
  searchArea: q<HTMLButtonElement>('#searchArea'),
  clearArea: q<HTMLButtonElement>('#clearArea'),
  fitMap: q<HTMLButtonElement>('#fitMap'),
  locate: q<HTMLButtonElement>('#locate'),
  locationPrompt: q<HTMLElement>('#locationPrompt'),
  locationUse: q<HTMLButtonElement>('#locationUse'),
  locationDismiss: q<HTMLButtonElement>('#locationDismiss'),
  webSuburb: q<HTMLElement>('#webSuburb'),
  areaDiscovery: q<HTMLElement>('#areaDiscovery'),
  areaDiscoverySummary: q<HTMLElement>('#areaDiscoverySummary'),
  cachedAreaResults: q<HTMLElement>('#cachedAreaResults'),
  liveAreaResults: q<HTMLElement>('#liveAreaResults'),
  crawlBar: q<HTMLElement>('#crawlBar'),
  crawlCount: q<HTMLElement>('#crawlCount'),
  crawlMode: q<HTMLSelectElement>('#crawlMode'),
  crawlOpen: q<HTMLAnchorElement>('#crawlOpen'),
  crawlClear: q<HTMLButtonElement>('#crawlClear'),
  makeSearch: q<HTMLInputElement>('#makeSearch'),
  makeKind: q<HTMLSelectElement>('#makeKind'),
  makeSort: q<HTMLSelectElement>('#makeSort'),
  makeFeatures: q<HTMLElement>('#makeFeatures'),
  makeCount: q<HTMLElement>('#makeCount'),
  makeStatus: q<HTMLElement>('#makeStatus'),
  makeResults: q<HTMLElement>('#makeResults'),
  makeReset: q<HTMLButtonElement>('#makeReset'),
  makeLocate: q<HTMLButtonElement>('#makeLocate'),
  dialog: q<HTMLDialogElement>('#detailDialog'),
  dialogContent: q<HTMLElement>('#dialogContent'),
  dialogClose: q<HTMLButtonElement>('#dialogClose'),
};

const seeMap = new SeeMap(q<HTMLElement>('#map'), () => {
  els.searchArea.hidden = false;
  els.webSuburb.textContent = nearestSuburb(seeMap.center(), dataset);
});
const makeMap = new MakeMap(q<HTMLElement>('#makeMap'), suburb => {
  state.makeSuburb = suburb;
  renderMake();
});

wire();
renderSee(true);
renderMake();
updateCrawl();

function q<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Missing required element: ${selector}`);
  return element;
}

function shell(data: Dataset): string {
  const kinds = [...new Set(data.venues.map(v => v.kind))].sort();
  return `
    <a class="skip-link" href="#resultsList">skip to listings</a>
    <header class="site-header">
      <div>
        <a class="brand" href="./">hangabout</a>
        <span class="tagline">art around you</span>
      </div>
      <div class="date">${melbourneLabel()}</div>
    </header>

    <main>
      <section class="hero">
        <div class="hero-title">
          <p class="eyebrow">melbourne</p>
          <h1>what's hanging,<br>where.</h1>
        </div>
        <p class="lede">Exhibitions, openings and places to look—with the artist-run, public, commercial and in-between parts of the city on the same map.</p>
      </section>

      <nav class="mode-switch" aria-label="choose mode">
        <button data-mode="see" class="mode is-active" aria-pressed="true">see art</button>
        <button data-mode="make" class="mode" aria-pressed="false">make art</button>
      </nav>

      <section id="seePanel">
        <aside id="locationPrompt" class="location-prompt">
          <div>
            <strong>Want the nearby stuff first?</strong>
            <span>Use your location on this device to sort by distance.</span>
          </div>
          <div class="button-row">
            <button id="locationUse" class="button solid">use my location</button>
            <button id="locationDismiss" class="button">not now</button>
          </div>
        </aside>

        <section class="filters" aria-label="find exhibitions">
          <input id="searchInput" class="search" type="search" aria-label="search exhibitions" placeholder="artist, gallery, suburb, medium…" autocomplete="off">
          <div id="quickFilters" class="chips">
            ${[
              ['all','everything'], ['open','open now'], ['today','open today'],
              ['weekend','this weekend'], ['openings','opening ≤7d'], ['closing','closing ≤7d'],
              ['free','free'], ['nearby','within 5 km'], ['saved','saved']
            ].map(([value,label]) => `<button class="chip${value === 'all' ? ' is-active' : ''}" data-quick="${value}" aria-pressed="${value === 'all'}">${label}</button>`).join('')}
          </div>
          <div class="select-row">
            <label>space
              <select id="venueKind"><option value="all">all spaces</option>${kinds.map(kind => `<option value="${esc(kind)}">${esc(kind.replaceAll('-', ' '))}</option>`).join('')}</select>
            </label>
            <label>sort
              <select id="sortMode">
                <option value="closing">closing soon</option>
                <option value="newest">recent / upcoming</option>
                <option value="distance">nearest</option>
                <option value="az">a–z</option>
              </select>
            </label>
          </div>
        </section>

        <section class="explorer">
          <div class="map-shell">
            <div id="map" role="region" aria-label="map of exhibition venues"></div>
            <div class="map-actions">
              <button id="searchArea" class="map-button" hidden>search this area</button>
              <button id="clearArea" class="map-button" hidden>show all areas</button>
              <button id="fitMap" class="map-button">show all pins</button>
              <button id="locate" class="map-button">locate me</button>
            </div>
            <div class="web-discovery">
              <span>find more around <strong id="webSuburb">Melbourne</strong></span>
              <div class="web-links">
                ${(['galleries','exhibitions','openings','everything'] as WebDiscoveryKind[])
                  .map(kind => `<button data-web="${kind}" class="text-link">${kind} ↗</button>`).join('')}
              </div>
              <section id="areaDiscovery" class="area-discovery" hidden aria-live="polite">
                <div class="area-discovery-head">
                  <strong>places in this map area</strong>
                  <span id="areaDiscoverySummary"></span>
                </div>
                <div id="cachedAreaResults" class="area-place-list"></div>
                <div id="liveAreaResults" class="area-place-list"></div>
              </section>
            </div>
          </div>

          <div class="results" id="results">
            <div class="results-head">
              <div><strong id="resultCount">0</strong> shows <span id="mappedCount"></span></div>
              <div id="status" class="status" role="status"></div>
            </div>
            <div id="resultsList"></div>
          </div>
        </section>
      </section>

      <section id="makePanel" hidden>
        <div class="make-intro">
          <p class="eyebrow">for artists</p>
          <h2>find somewhere to make.</h2>
          <p>Start with current studio listings, then widen the search to shared workshops, live opportunities and gallery pathways. Every result shows where its information came from and when it was last checked.</p>
          <p class="freshness-note"><strong>Availability changes quickly.</strong> Checked dates are shown on every listing; confirm with the source before travelling, applying or paying.</p>
        </div>

        <div class="make-grid">
          <div class="map-shell">
            <div id="makeMap" role="region" aria-label="map of artist resources"></div>
            <div class="map-actions">
              <button id="makeReset" class="map-button" hidden>show all resources</button>
              <button id="makeLocate" class="map-button">sort near me</button>
            </div>
            <p class="make-map-note">pins are grouped by suburb · open one for studio names, prices and links</p>
          </div>
          <div>
            <div class="make-controls">
              <input id="makeSearch" class="search" type="search" aria-label="search artist resources" placeholder="studio, suburb, printmaking, 24/7…" autocomplete="off">
              <div class="make-selects">
                <label>show
                  <select id="makeKind">
                  <option value="studio">find a studio</option>
                  <option value="resources">all making resources</option>
                  <option value="workspace">shared workspaces + finders</option>
                  <option value="opportunity">opportunities + development</option>
                  <option value="pathways">gallery / organisation pathways</option>
                  </select>
                </label>
                <label>sort
                  <select id="makeSort">
                    <option value="relevance">recommended</option>
                    <option value="price">lowest advertised price</option>
                    <option value="distance">nearest</option>
                    <option value="az">a–z</option>
                  </select>
                </label>
              </div>
              <div id="makeFeatures" class="chips" aria-label="studio features">
                ${[
                  ['available-now', 'vacancies now'],
                  ['24/7', '24/7 access'],
                  ['wash-up', 'wash-up space'],
                  ['natural-light', 'natural light'],
                  ['accessible', 'accessible'],
                ].map(([value, label]) => `<button class="chip" data-make-feature="${value}" aria-pressed="false">${label}</button>`).join('')}
              </div>
            </div>
            <div class="results-head"><strong id="makeCount">0 studios</strong><span id="makeStatus" class="status" role="status"></span></div>
            <div id="makeResults"></div>
          </div>
        </div>
      </section>
    </main>

    <aside id="crawlBar" class="crawl-bar" hidden>
      <div><strong>your crawl</strong> · <span id="crawlCount">0 stops</span></div>
      <div class="crawl-actions">
        <select id="crawlMode" aria-label="travel mode">
          <option value="walking">walk</option>
          <option value="bicycling">bike</option>
          <option value="driving">drive</option>
        </select>
        <button id="crawlClear" class="text-link">clear</button>
        <a id="crawlOpen" class="button solid" target="_blank" rel="noopener">route in google maps ↗</a>
      </div>
    </aside>

    <dialog id="detailDialog" class="detail-dialog">
      <button id="dialogClose" class="dialog-close" aria-label="close">×</button>
      <div id="dialogContent"></div>
    </dialog>

    <footer>
      <strong>hangabout</strong>
      <span>${data.events.length} listings · ${data.venues.length} spaces · ${data.venues.filter(v => v.lat != null && v.lng != null).length} exact/building pins · ${data.resources.length} make-art resources</span>
    </footer>
  `;
}

function wire() {
  els.seeTab.addEventListener('click', () => setMode('see'));
  els.makeTab.addEventListener('click', () => setMode('make'));

  els.search.addEventListener('input', () => { state.query = els.search.value; renderSee(); });
  els.kind.addEventListener('change', () => { state.venueKind = els.kind.value; renderSee(); });
  els.sort.addEventListener('change', () => {
    state.sort = els.sort.value as typeof state.sort;
    if (state.sort === 'distance' && !state.userLocation) {
      locate();
      return;
    }
    renderSee();
  });

  els.quick.addEventListener('click', event => {
    const target = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-quick]');
    if (!target) return;
    state.quick = target.dataset.quick as typeof state.quick;
    els.quick.querySelectorAll<HTMLButtonElement>('.chip').forEach(chip => {
      const active = chip === target;
      chip.classList.toggle('is-active', active);
      chip.setAttribute('aria-pressed', String(active));
    });
    if (state.quick === 'nearby' && !state.userLocation) {
      locate();
      return;
    }
    renderSee();
  });

  els.searchArea.addEventListener('click', () => {
    state.areaBounds = seeMap.bounds();
    els.searchArea.hidden = true;
    els.clearArea.hidden = false;
    renderAreaDiscovery();
    renderSee();
  });

  els.clearArea.addEventListener('click', () => {
    state.areaBounds = null;
    els.clearArea.hidden = true;
    els.searchArea.hidden = true;
    clearAreaDiscovery();
    renderSee(true);
  });

  els.fitMap.addEventListener('click', () => {
    state.areaBounds = null;
    els.clearArea.hidden = true;
    els.searchArea.hidden = true;
    clearAreaDiscovery();
    seeMap.fitAll(dataset);
    renderSee();
  });

  els.locate.addEventListener('click', locate);
  els.locationUse.addEventListener('click', locate);
  els.locationDismiss.addEventListener('click', () => els.locationPrompt.hidden = true);

  document.querySelector('.web-links')?.addEventListener('click', event => {
    const target = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-web]');
    if (!target) return;
    const suburb = nearestSuburb(seeMap.center(), dataset);
    window.open(googleSearchUrl(target.dataset.web as WebDiscoveryKind, suburb), '_blank', 'noopener');
  });

  els.results.addEventListener('click', event => {
    const target = event.target as HTMLElement;
    const detail = target.closest<HTMLButtonElement>('[data-detail]');
    if (detail) return openDetail(detail.dataset.detail!);

    const save = target.closest<HTMLButtonElement>('[data-save]');
    if (save) {
      toggleId(state.saved, save.dataset.save!);
      writeIds('hangabout.saved', state.saved);
      renderSee();
      return;
    }

    const crawl = target.closest<HTMLButtonElement>('[data-crawl]');
    if (crawl) {
      toggleId(state.crawl, crawl.dataset.crawl!);
      writeIds('hangabout.crawl', state.crawl);
      renderSee();
      updateCrawl();
    }
  });

  els.crawlClear.addEventListener('click', () => {
    state.crawl.clear();
    writeIds('hangabout.crawl', state.crawl);
    renderSee();
    updateCrawl();
  });
  els.crawlMode.addEventListener('change', updateCrawl);

  els.makeSearch.addEventListener('input', () => {
    state.makeQuery = els.makeSearch.value;
    state.makeSuburb = null;
    renderMake();
  });
  els.makeKind.addEventListener('change', () => { state.makeKind = els.makeKind.value; state.makeSuburb = null; renderMake(); });
  els.makeSort.addEventListener('change', () => {
    state.makeSort = els.makeSort.value as typeof state.makeSort;
    if (state.makeSort === 'distance' && !state.userLocation) {
      locate();
      return;
    }
    renderMake();
  });
  els.makeFeatures.addEventListener('click', event => {
    const target = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-make-feature]');
    if (!target) return;
    const feature = target.dataset.makeFeature!;
    if (state.makeFeatures.has(feature)) state.makeFeatures.delete(feature);
    else state.makeFeatures.add(feature);
    target.classList.toggle('is-active', state.makeFeatures.has(feature));
    target.setAttribute('aria-pressed', String(state.makeFeatures.has(feature)));
    state.makeSuburb = null;
    renderMake();
  });
  els.makeReset.addEventListener('click', () => { state.makeSuburb = null; renderMake(); });
  els.makeLocate.addEventListener('click', locate);

  els.makeResults.addEventListener('click', event => {
    const target = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-venue-detail]');
    if (!target) return;
    openVenueDetail(target.dataset.venueDetail!);
  });

  els.dialogClose.addEventListener('click', () => els.dialog.close());
  els.dialog.addEventListener('click', event => {
    if (event.target === els.dialog) els.dialog.close();
  });
}

function setMode(mode: 'see' | 'make') {
  state.mode = mode;
  els.seeTab.classList.toggle('is-active', mode === 'see');
  els.makeTab.classList.toggle('is-active', mode === 'make');
  els.seeTab.setAttribute('aria-pressed', String(mode === 'see'));
  els.makeTab.setAttribute('aria-pressed', String(mode === 'make'));
  els.seePanel.hidden = mode !== 'see';
  els.makePanel.hidden = mode !== 'make';
  els.skipLink.href = mode === 'see' ? '#resultsList' : '#makeResults';
  if (mode === 'see') seeMap.invalidate();
  else makeMap.show();
}

function filteredEvents(): Event[] {
  const query = norm(state.query);
  let rows = dataset.events.filter(event => isEventUpcoming(event));

  rows = rows.filter(event => {
    const venue = venueById.get(event.venueId);
    if (!venue) return false;
    if (state.venueKind !== 'all' && venue.kind !== state.venueKind) return false;
    if (query && !norm([
      event.title, event.artists.join(' '), event.tags?.join(' ') ?? '',
      venue.name, venue.suburb, venue.kind,
    ].join(' ')).includes(query)) return false;

    if (state.quick === 'open' && (!isEventCurrent(event) || !isVenueOpenNow(venue))) return false;
    if (state.quick === 'today' && (!isEventCurrent(event) || !isVenueOpenToday(venue))) return false;
    if (state.quick === 'weekend' && !intersectsThisWeekend(event)) return false;
    if (state.quick === 'openings' && !openingWithin(event, 7)) return false;
    if (state.quick === 'closing' && !closesWithin(event, 7)) return false;
    if (state.quick === 'free' && event.admission !== 'free') return false;
    if (state.quick === 'saved' && !state.saved.has(event.id)) return false;

    const point = venuePoint(venue);
    if (state.quick === 'nearby') {
      if (!state.userLocation || !point || haversine(state.userLocation, point) > 5) return false;
    }
    if (state.areaBounds && (!point || !pointInsideBounds(point, state.areaBounds))) return false;
    return true;
  });

  rows.sort((a, b) => {
    if (state.sort === 'az') return a.title.localeCompare(b.title);
    if (state.sort === 'newest') return b.startDate.localeCompare(a.startDate) || a.title.localeCompare(b.title);
    if (state.sort === 'distance' && state.userLocation) {
      const ap = venuePoint(venueById.get(a.venueId)!);
      const bp = venuePoint(venueById.get(b.venueId)!);
      const ad = ap ? haversine(state.userLocation, ap) : Infinity;
      const bd = bp ? haversine(state.userLocation, bp) : Infinity;
      return ad - bd || a.title.localeCompare(b.title);
    }
    return a.endDate.localeCompare(b.endDate) || a.title.localeCompare(b.title);
  });

  return rows;
}

function renderSee(focusMap = false) {
  const rows = filteredEvents();
  els.resultCount.textContent = String(rows.length);

  const exactMapped = new Set(
    rows.map(event => venueById.get(event.venueId))
      .filter((venue): venue is Venue => Boolean(venue?.lat != null && venue?.lng != null))
      .map(venue => venue.id)
  ).size;
  const approximate = new Set(rows.map(event => venueById.get(event.venueId)).filter(Boolean).filter(v => v!.lat == null || v!.lng == null)).size;
  els.mappedCount.textContent = `· ${exactMapped} exact pins${approximate ? ` · ${approximate} area-matched spaces` : ''}`;

  if (state.quick === 'nearby' && !state.userLocation) {
    els.status.textContent = 'location needed for within 5 km';
  } else if (state.areaBounds) {
    els.status.textContent = 'showing the visible map area; unpinned venues participate by suburb';
  } else {
    els.status.textContent = '';
  }

  els.results.innerHTML = rows.map(eventCard).join('') ||
    `<div class="empty"><strong>nothing there.</strong><span>Try another filter or clear the map area.</span></div>`;

  seeMap.render(rows, dataset, focusMap);
}

function renderAreaDiscovery() {
  if (!state.areaBounds) return clearAreaDiscovery();
  const areaEvents = filteredEvents();
  const places = dataset.knownPlaces.filter(place =>
    pointInsideBounds([place.lat, place.lng], state.areaBounds!)
  );

  els.areaDiscovery.hidden = false;
  els.areaDiscoverySummary.textContent = `${areaEvents.length} exhibition ${areaEvents.length === 1 ? 'listing' : 'listings'} · ${places.length} known ${places.length === 1 ? 'place' : 'places'} awaiting programmes`;
  els.cachedAreaResults.innerHTML = `
    <a class="area-results-jump" href="#resultsList">${areaEvents.length ? `view ${areaEvents.length} exhibition ${areaEvents.length === 1 ? 'listing' : 'listings'}` : 'no current hangabout exhibition listings here yet'} ↓</a>
  ` + places.map(place => `
    <article class="area-place">
      <div><strong>${esc(place.name)}</strong><span>${esc(place.locality)} · known public gallery</span></div>
      <a href="${safeUrl(place.sourceUrl)}" target="_blank" rel="noopener">directory source ↗</a>
    </article>
  `).join('');
  els.liveAreaResults.innerHTML = '<p class="area-place-message">checking OpenStreetMap for additional art places…</p>';
}

function clearAreaDiscovery() {
  els.areaDiscovery.hidden = true;
  els.areaDiscoverySummary.textContent = '';
  els.cachedAreaResults.innerHTML = '';
  els.liveAreaResults.innerHTML = '';
}

function eventCard(event: Event): string {
  const venue = venueById.get(event.venueId)!;
  const saved = state.saved.has(event.id);
  const inCrawl = state.crawl.has(event.id);
  const distance = state.userLocation && venuePoint(venue)
    ? `${haversine(state.userLocation, venuePoint(venue)!).toFixed(1)} km`
    : '';
  return `
    <article class="event-card" id="event-${esc(event.id)}" tabindex="-1">
      <div class="card-top">
        <span class="kind">${esc(venue.kind.replaceAll('-', ' '))}</span>
        <span>${esc(formatDateRange(event.startDate, event.endDate))}</span>
      </div>
      <h3>${esc(event.title)}</h3>
      <p class="artists">${esc(event.artists.join(', '))}</p>
      <p class="venue-line"><strong>${esc(venue.name)}</strong> · ${esc(venue.suburb)}${distance ? ` · ${distance}` : ''}</p>
      <div class="meta">
        <span>${event.sourceType === 'official' ? 'official source' : 'directory source'}</span>
        ${event.admission === 'free' ? '<span>free</span>' : ''}
        ${venue.lat != null ? '<span>exact pin</span>' : '<span>area location</span>'}
      </div>
      <div class="card-actions">
        <button class="text-link" data-detail="${esc(event.id)}" aria-label="details for ${esc(event.title)}">details</button>
        <button class="text-link" data-save="${esc(event.id)}" aria-label="${saved ? 'remove saved' : 'save'} ${esc(event.title)}">${saved ? 'saved ✓' : 'save'}</button>
        <button class="text-link" data-crawl="${esc(event.id)}" aria-label="${inCrawl ? 'remove from crawl' : 'add to crawl'} ${esc(event.title)}">${inCrawl ? 'in crawl ✓' : 'add to crawl'}</button>
      </div>
    </article>
  `;
}

function openDetail(eventId: string) {
  const event = dataset.events.find(item => item.id === eventId);
  if (!event) return;
  const venue = venueById.get(event.venueId);
  if (!venue) return;
  const opening = event.opening?.date
    ? `<p><strong>opening:</strong> ${esc(event.opening.date)} ${esc(event.opening.start ?? '')}${event.opening.end ? `–${esc(event.opening.end)}` : ''}</p>`
    : '';
  els.dialogContent.innerHTML = `
    <p class="eyebrow">${esc(venue.kind.replaceAll('-', ' '))}</p>
    <h2>${esc(event.title)}</h2>
    <p class="artists">${esc(event.artists.join(', '))}</p>
    <p><strong>${esc(venue.name)}</strong><br>${esc(venue.address)}</p>
    <p>${esc(formatDateRange(event.startDate, event.endDate))}</p>
    ${opening}
    <p><strong>source:</strong> ${esc(event.sourceName)} · checked ${esc(event.lastVerified)}</p>
    <div class="dialog-links">
      <a href="${safeUrl(event.sourceUrl)}" target="_blank" rel="noopener">event source ↗</a>
      <a href="${safeUrl(venue.website)}" target="_blank" rel="noopener">venue website ↗</a>
      <a href="${safeUrl(mapsUrl(venue.address,'apple'))}" target="_blank" rel="noopener">apple maps ↗</a>
      <a href="${safeUrl(mapsUrl(venue.address,'google'))}" target="_blank" rel="noopener">google maps ↗</a>
      <a href="${safeUrl(mapsUrl(venue.address,'waze'))}" target="_blank" rel="noopener">waze ↗</a>
    </div>
  `;
  els.dialog.showModal();
}

function renderMake() {
  const query = norm(state.makeQuery);
  let resources = dataset.resources.filter(resource =>
    !query || norm([resource.name, resource.suburb, resource.summary, resource.tags?.join(' ') ?? '', resource.availability ?? ''].join(' ')).includes(query)
  );
  let venuePathways: Venue[] = [];

  if (state.makeKind === 'studio') resources = resources.filter(r => r.resourceType === 'studio');
  else if (state.makeKind === 'workspace') resources = resources.filter(r => ['workspace','finder'].includes(r.resourceType));
  else if (state.makeKind === 'opportunity') resources = resources.filter(r => r.resourceType === 'opportunity');
  else if (state.makeKind === 'pathways') {
    resources = [];
    venuePathways = dataset.venues.filter(v => v.artistPathways?.length && (!query || norm([v.name, v.suburb, v.focus?.join(' ') ?? '', (v.artistPathways ?? []).map(p => p.label).join(' ')].join(' ')).includes(query)));
  } else {
    resources = resources.filter(r => ['studio','workspace','finder','opportunity'].includes(r.resourceType));
  }

  if (state.makeKind !== 'pathways' && state.makeFeatures.size) {
    resources = resources.filter(resource => [...state.makeFeatures].every(feature => resourceMatchesFeature(resource, feature)));
  }

  sortMakeResults(resources, venuePathways);

  const mapResources = [...resources];
  if (state.makeSuburb) {
    resources = resources.filter(r => norm(r.suburb) === norm(state.makeSuburb!));
    venuePathways = venuePathways.filter(v => norm(v.suburb) === norm(state.makeSuburb!));
  }

  const total = resources.length + venuePathways.length;
  els.makeCount.textContent = `${total} ${makeResultNoun(total)}`;
  els.makeStatus.textContent = [
    state.makeSuburb ? `showing ${state.makeSuburb}` : '',
    state.makeSort === 'distance' && state.userLocation ? 'nearest first · map positions may be suburb-level' : '',
  ].filter(Boolean).join(' · ');
  els.makeReset.hidden = !state.makeSuburb;
  els.makeReset.textContent = state.makeKind === 'studio' ? 'show all studios' : 'show all resources';
  els.makeFeatures.hidden = ['opportunity', 'pathways'].includes(state.makeKind);

  els.makeResults.innerHTML = [
    ...resources.map(resourceCard),
    ...venuePathways.map(pathwayCard),
  ].join('') || `<div class="empty"><strong>nothing there.</strong><span>Try another search or remove a feature filter.</span></div>`;

  makeMap.render(mapResources, venuePathways);
}

function resourceCard(resource: MakeResource): string {
  const point = resourcePoint(resource);
  const distance = state.userLocation && point ? `${haversine(state.userLocation, point).toFixed(1)} km approx.` : '';
  const freshness = resourceFreshness(resource);
  const freshnessAdvice = freshness.state === 'current'
    ? 'confirm current availability'
    : freshness.state === 'recheck'
      ? 'recheck recommended'
      : 'availability may have changed';
  return `
    <article class="resource-card" id="resource-${esc(resource.id)}" tabindex="-1">
      <div class="card-top"><span class="kind">${esc(resource.resourceType)}</span><span>${esc(resource.sourceType)} source</span></div>
      <h3>${esc(resource.name)}</h3>
      <p class="venue-line">${esc(resource.suburb)} · ${esc(resource.address)}</p>
      <p>${esc(resource.summary)}</p>
      <div class="resource-facts">
        ${resource.price ? `<span>${esc(resource.price)}</span>` : ''}
        ${resource.size ? `<span>${esc(resource.size)}</span>` : ''}
        ${resource.availability ? `<span>${esc(resource.availability)}</span>` : ''}
        ${distance ? `<span>${esc(distance)}</span>` : ''}
      </div>
      ${resource.tags?.length ? `<div class="resource-tags">${resource.tags.slice(0, 7).map(tag => `<span>${esc(tag)}</span>`).join('')}</div>` : ''}
      <div class="resource-source">
        <a href="${safeUrl(resource.website)}" target="_blank" rel="noopener">availability and details ↗</a>
        <span class="freshness freshness-${freshness.state}">${esc(resource.sourceName)} · last checked ${esc(formatChecked(resource.lastVerified))} (${esc(freshness.relativeLabel)}) · ${freshnessAdvice}</span>
      </div>
    </article>
  `;
}

function pathwayCard(venue: Venue): string {
  return `
    <article class="resource-card" id="pathway-${esc(venue.id)}" tabindex="-1">
      <div class="card-top"><span class="kind">${esc(venue.kind.replaceAll('-', ' '))}</span><span>${esc(venue.suburb)}</span></div>
      <h3>${esc(venue.name)}</h3>
      <div class="pathways">
        ${(venue.artistPathways ?? []).map(path => `<a href="${safeUrl(path.url)}" target="_blank" rel="noopener">${esc(path.label)} ↗</a>`).join('')}
      </div>
      <button class="text-link" data-venue-detail="${esc(venue.id)}">venue details</button>
    </article>
  `;
}

function openVenueDetail(venueId: string) {
  const venue = venueById.get(venueId);
  if (!venue) return;
  els.dialogContent.innerHTML = `
    <p class="eyebrow">${esc(venue.kind.replaceAll('-', ' '))}</p>
    <h2>${esc(venue.name)}</h2>
    <p>${esc(venue.address)}</p>
    <p>${esc(venue.focus?.join(' · ') ?? '')}</p>
    ${venue.access?.note ? `<p><strong>access:</strong> ${esc(venue.access.note)}</p>` : ''}
    <div class="dialog-links">
      <a href="${safeUrl(venue.website)}" target="_blank" rel="noopener">website ↗</a>
      ${(venue.artistPathways ?? []).map(path => `<a href="${safeUrl(path.url)}" target="_blank" rel="noopener">${esc(path.label)} ↗</a>`).join('')}
    </div>
  `;
  els.dialog.showModal();
}

function locate() {
  const setStatus = (message: string) => {
    if (state.mode === 'make') els.makeStatus.textContent = message;
    else els.status.textContent = message;
  };
  if (!navigator.geolocation) {
    setStatus('location is not available in this browser');
    return;
  }
  setStatus('finding you…');
  navigator.geolocation.getCurrentPosition(
    position => {
      const point: Point = [position.coords.latitude, position.coords.longitude];
      state.userLocation = point;
      els.locationPrompt.hidden = true;
      seeMap.setUserLocation(point);
      makeMap.setUserLocation(point);
      if (state.mode === 'make') {
        state.makeSort = 'distance';
        els.makeSort.value = 'distance';
        renderMake();
        setStatus('nearest resources first · map positions may be suburb-level');
      } else {
        state.sort = 'distance';
        els.sort.value = 'distance';
        renderSee();
        setStatus('nearby sorting is on');
      }
    },
    () => {
      if (state.mode === 'make' && state.makeSort === 'distance') {
        state.makeSort = 'relevance';
        els.makeSort.value = 'relevance';
        renderMake();
      } else if (state.sort === 'distance') {
        state.sort = 'closing';
        els.sort.value = 'closing';
        renderSee();
      }
      setStatus('location permission was not granted');
    },
    { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 },
  );
}

function resourceMatchesFeature(resource: MakeResource, feature: string): boolean {
  const tags = norm(resource.tags?.join(' ') ?? '');
  if (feature === 'available-now') return norm(resource.availability ?? '').includes('available now');
  if (feature === '24/7') return tags.includes('24/7') || tags.includes('24-hour');
  if (feature === 'wash-up') return tags.includes('wash-up') || tags.includes('washout');
  if (feature === 'natural-light') return tags.includes('natural light');
  if (feature === 'accessible') return tags.includes('accessible') || tags.includes('wheelchair');
  return true;
}

function sortMakeResults(resources: MakeResource[], pathways: Venue[]) {
  if (state.makeSort === 'az') {
    resources.sort((a, b) => a.name.localeCompare(b.name));
    pathways.sort((a, b) => a.name.localeCompare(b.name));
    return;
  }
  if (state.makeSort === 'price') {
    resources.sort((a, b) => comparePrice(monthlyPrice(a.price), monthlyPrice(b.price)) || a.name.localeCompare(b.name));
    return;
  }
  if (state.makeSort === 'distance' && state.userLocation) {
    const origin = state.userLocation;
    resources.sort((a, b) => pointDistance(origin, resourcePoint(a)) - pointDistance(origin, resourcePoint(b)));
    pathways.sort((a, b) => pointDistance(origin, venuePoint(a)) - pointDistance(origin, venuePoint(b)));
    return;
  }
  if (state.makeSort === 'relevance') {
    resources.sort((a, b) => availabilityRank(a) - availabilityRank(b)
      || comparePrice(monthlyPrice(a.price), monthlyPrice(b.price))
      || a.name.localeCompare(b.name));
  }
}

function availabilityRank(resource: MakeResource): number {
  const availability = norm(resource.availability ?? '');
  if (availability.includes('available now')) return 0;
  if (availability.includes('available from')) return 1;
  if (availability.includes('enquir') || availability.includes('waitlist') || availability.includes('mailing list')) return 2;
  if (availability.includes('occupied')) return 4;
  return 3;
}

function pointDistance(origin: Point, point: Point | null): number {
  return point ? haversine(origin, point) : Number.POSITIVE_INFINITY;
}

function monthlyPrice(price?: string): number {
  if (!price || /enquiry|free/i.test(price)) return Number.POSITIVE_INFINITY;
  const match = price.match(/A\$([\d,]+)/i);
  const amount = match?.[1];
  if (!amount) return Number.POSITIVE_INFINITY;
  const value = Number(amount.replaceAll(',', ''));
  if (/\/week|per week/i.test(price)) return value * 52 / 12;
  if (/\/hour|per hour|\/day|per day/i.test(price)) return Number.POSITIVE_INFINITY;
  return value;
}

function comparePrice(a: number, b: number): number {
  if (a === b) return 0;
  if (!Number.isFinite(a)) return 1;
  if (!Number.isFinite(b)) return -1;
  return a - b;
}

function makeResultNoun(total: number): string {
  const singular = total === 1;
  if (state.makeKind === 'studio') return singular ? 'studio' : 'studios';
  if (state.makeKind === 'opportunity') return singular ? 'opportunity' : 'opportunities';
  if (state.makeKind === 'pathways') return singular ? 'pathway' : 'pathways';
  return singular ? 'resource' : 'resources';
}

function formatChecked(iso: string): string {
  const date = new Date(`${iso}T12:00:00+10:00`);
  return new Intl.DateTimeFormat('en-AU', {
    day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Australia/Melbourne',
  }).format(date);
}

function updateCrawl() {
  const events = dataset.events.filter(event => state.crawl.has(event.id));
  const unique = new Map<string, Venue>();
  for (const event of events) {
    const venue = venueById.get(event.venueId);
    if (venue) unique.set(venue.id, venue);
  }

  let venues = [...unique.values()];
  if (state.userLocation) {
    venues = venues.sort((a, b) => {
      const ap = venuePoint(a);
      const bp = venuePoint(b);
      return (ap ? haversine(state.userLocation!, ap) : Infinity) - (bp ? haversine(state.userLocation!, bp) : Infinity);
    });
  }
  els.crawlBar.hidden = venues.length === 0;
  els.crawlCount.textContent = `${venues.length} ${venues.length === 1 ? 'stop' : 'stops'}`;
  const url = googleCrawlUrl(venues.map(v => v.address), els.crawlMode.value as 'walking'|'bicycling'|'driving');
  if (url) els.crawlOpen.href = url;
}

function toggleId(set: Set<string>, id: string) {
  if (set.has(id)) set.delete(id);
  else set.add(id);
}

function norm(value: string): string {
  return value.toLowerCase().normalize('NFKD').replace(/\p{Diacritic}/gu, '').trim();
}

function esc(value: string): string {
  const entities: Record<string, string> = {
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;',
  };
  return value.replace(/[&<>"']/g, char => entities[char] ?? char);
}

function safeUrl(value: string): string {
  try {
    const url = new URL(value, window.location.href);
    if (!['http:', 'https:'].includes(url.protocol)) return '#';
    return esc(url.toString());
  } catch {
    return '#';
  }
}
