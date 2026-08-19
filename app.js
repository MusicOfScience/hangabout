const state = {
  venues: [],
  events: [],
  mode: 'see',
  quick: 'all',
  venueType: 'all',
  sort: 'closing',
  query: '',
  userLocation: null,
  savedOnly: false,
  saved: loadStoredSet('hangabout:saved'),
  crawl: loadStoredSet('hangabout:crawl'),
  map: null,
  mapAvailable: false,
  markers: new Map(),
  markerLayer: null,
  locationLayer: null,
  makeQuery: '',
  makeKind: 'all',
  pathwaysOnly: false,
};

const MELBOURNE = [-37.8136, 144.9631];
const MELBOURNE_TZ = 'Australia/Melbourne';
const DAY_MS = 86_400_000;
const KIND_LABELS = {
  'artist-run': 'artist-run initiative',
  'commercial': 'commercial gallery',
  'contemporary-org': 'contemporary art organisation',
  'first-nations-led': 'First Nations-led',
  'independent': 'independent / non-profit',
  'municipal': 'public / municipal gallery',
  'specialist': 'specialist space',
  'university': 'university / art-school gallery',
};
const KIND_ORDER = ['first-nations-led', 'artist-run', 'independent', 'specialist', 'contemporary-org', 'university', 'municipal', 'commercial'];
const WEEKDAY_NUMBER = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const venueById = id => state.venues.find(venue => venue.id === id);
const normalise = (value = '') => String(value).toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
const escapeHtml = (value = '') => String(value).replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#039;', '"': '&quot;' }[char]));
const escapeAttr = escapeHtml;

function loadStoredSet(key) {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || '[]');
    return new Set(Array.isArray(parsed) ? parsed.filter(value => typeof value === 'string') : []);
  } catch {
    localStorage.removeItem(key);
    return new Set();
  }
}

function persistSet(key, set) {
  try { localStorage.setItem(key, JSON.stringify([...set])); } catch { /* storage can be blocked */ }
}

function safeUrl(value) {
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) ? url.href : '#';
  } catch {
    return '#';
  }
}

function isoToUtc(dateString) { return new Date(`${dateString}T00:00:00Z`); }
function dateAdd(dateString, days) { return new Date(isoToUtc(dateString).getTime() + days * DAY_MS).toISOString().slice(0, 10); }
function dateDiff(from, to) { return Math.round((isoToUtc(to) - isoToUtc(from)) / DAY_MS); }

function melbourneClock(date = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-AU', {
    timeZone: MELBOURNE_TZ,
    year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(date).filter(part => part.type !== 'literal').map(part => [part.type, part.value]));
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    weekday: WEEKDAY_NUMBER[parts.weekday],
    minutes: Number(parts.hour) * 60 + Number(parts.minute),
  };
}

function formatDate(value, options = { day: 'numeric', month: 'short' }) {
  return new Intl.DateTimeFormat('en-AU', { timeZone: 'UTC', ...options }).format(isoToUtc(value));
}

function formatMinutes(minutes) {
  const hour24 = Math.floor(minutes / 60);
  const minute = minutes % 60;
  const suffix = hour24 >= 12 ? 'pm' : 'am';
  const hour = hour24 % 12 || 12;
  return `${hour}${minute ? `:${String(minute).padStart(2, '0')}` : ''}${suffix}`;
}

function formatClockRange(start, end) {
  const toMinutes = value => {
    const [hour, minute] = value.split(':').map(Number);
    return hour * 60 + minute;
  };
  return `${formatMinutes(toMinutes(start))}–${formatMinutes(toMinutes(end))}`;
}

function eventIsCurrent(event, today = melbourneClock().date) {
  return event.startDate <= today && event.endDate >= today;
}

function verifiedHoursFor(venue, weekday) {
  if (!venue.hoursVerified) return null;
  return venue.hours?.[String(weekday)] || null;
}

function venueIsOpenNow(venue, clock = melbourneClock()) {
  const hours = verifiedHoursFor(venue, clock.weekday);
  return Boolean(hours && clock.minutes >= hours[0] && clock.minutes < hours[1]);
}

function venueOpenToday(venue, clock = melbourneClock()) {
  return Boolean(verifiedHoursFor(venue, clock.weekday));
}

function humanHoursForDay(venue, weekday) {
  if (!venue.hoursVerified) return 'hours unverified';
  const hours = verifiedHoursFor(venue, weekday);
  return hours ? `${formatMinutes(hours[0])}–${formatMinutes(hours[1])}` : 'closed';
}

function weekendDates(today = melbourneClock().date, weekday = melbourneClock().weekday) {
  const daysUntilSaturday = (6 - weekday + 7) % 7;
  const saturday = dateAdd(today, daysUntilSaturday);
  return [saturday, dateAdd(saturday, 1)];
}

function eventAvailableThisWeekend(event) {
  const clock = melbourneClock();
  const [saturday, sunday] = weekendDates(clock.date, clock.weekday);
  const venue = venueById(event.venueId);
  const overlaps = event.startDate <= sunday && event.endDate >= saturday;
  if (!venue) return false;
  if (event.opening?.date === saturday || event.opening?.date === sunday) return true;
  if (!overlaps) return false;
  return Boolean(verifiedHoursFor(venue, 6) || verifiedHoursFor(venue, 0));
}

function eventOpeningSoon(event) {
  if (!event.opening) return false;
  const days = dateDiff(melbourneClock().date, event.opening.date);
  return days >= 0 && days <= 7;
}

function eventClosingSoon(event) {
  const days = dateDiff(melbourneClock().date, event.endDate);
  return days >= 0 && days <= 7;
}

function haversineKm(a, b) {
  const radius = 6371;
  const rad = value => value * Math.PI / 180;
  const dLat = rad(b[0] - a[0]);
  const dLng = rad(b[1] - a[1]);
  const latitude1 = rad(a[0]);
  const latitude2 = rad(b[0]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(latitude1) * Math.cos(latitude2) * Math.sin(dLng / 2) ** 2;
  return 2 * radius * Math.asin(Math.sqrt(h));
}

function eventSearchText(event, venue) {
  return normalise([
    event.title, event.artists?.join(' '), event.eventType, event.tags?.join(' '),
    venue.name, KIND_LABELS[venue.kind], venue.suburb, venue.focus?.join(' '),
  ].join(' '));
}

function filteredEvents() {
  const q = normalise(state.query.trim());
  const clock = melbourneClock();
  let rows = state.events.filter(event => {
    const venue = venueById(event.venueId);
    if (!venue || event.endDate < clock.date) return false;
    if (state.savedOnly && !state.saved.has(event.id)) return false;
    if (state.venueType !== 'all' && venue.kind !== state.venueType) return false;
    if (q && !eventSearchText(event, venue).includes(q)) return false;

    switch (state.quick) {
      case 'open': return eventIsCurrent(event, clock.date) && venueIsOpenNow(venue, clock);
      case 'today': return event.opening?.date === clock.date || (eventIsCurrent(event, clock.date) && venueOpenToday(venue, clock));
      case 'weekend': return eventAvailableThisWeekend(event);
      case 'openings': return eventOpeningSoon(event);
      case 'closing': return eventClosingSoon(event);
      case 'free': return event.admission === 'free';
      case 'nearby': return Boolean(state.userLocation && venue.lat != null && venue.lng != null && haversineKm(state.userLocation, [venue.lat, venue.lng]) <= 5);
      default: return true;
    }
  });

  rows.sort((a, b) => {
    const venueA = venueById(a.venueId);
    const venueB = venueById(b.venueId);
    if (state.sort === 'newest') return b.startDate.localeCompare(a.startDate);
    if (state.sort === 'az') return a.title.localeCompare(b.title);
    if (state.sort === 'distance') {
      const aMapped = venueA?.lat != null && venueA?.lng != null;
      const bMapped = venueB?.lat != null && venueB?.lng != null;
      if (!state.userLocation) return venueA.suburb.localeCompare(venueB.suburb);
      if (aMapped && bMapped) return haversineKm(state.userLocation, [venueA.lat, venueA.lng]) - haversineKm(state.userLocation, [venueB.lat, venueB.lng]);
      if (aMapped !== bMapped) return aMapped ? -1 : 1;
      return venueA.name.localeCompare(venueB.name);
    }
    return a.endDate.localeCompare(b.endDate) || a.title.localeCompare(b.title);
  });

  return rows;
}

function statusFor(event, venue) {
  const clock = melbourneClock();
  if (event.startDate > clock.date) return { label: `opens ${formatDate(event.startDate)}`, cls: 'status-unknown' };
  if (!venue.hoursVerified) return { label: 'hours unverified', cls: 'status-unknown' };
  const hours = verifiedHoursFor(venue, clock.weekday);
  if (!hours) return { label: 'closed today', cls: 'status-closed' };
  if (clock.minutes < hours[0]) return { label: `opens today · ${formatMinutes(hours[0])}`, cls: 'status-unknown' };
  if (clock.minutes >= hours[1]) return { label: `closed now · ${formatMinutes(hours[0])}–${formatMinutes(hours[1])}`, cls: 'status-closed' };
  return { label: `open now · until ${formatMinutes(hours[1])}`, cls: 'status-open' };
}

function markerIcon(active = false) {
  if (!state.mapAvailable) return null;
  return window.L.divIcon({
    className: 'hangabout-marker-wrap',
    html: `<span class="hangabout-marker${active ? ' is-active' : ''}"></span>`,
    iconSize: [active ? 20 : 14, active ? 20 : 14],
    iconAnchor: [active ? 10 : 7, active ? 10 : 7],
  });
}

function initialiseMap() {
  const panel = $('.map-panel');
  if (!window.L) {
    panel.classList.add('is-unavailable');
    $('#map').hidden = true;
    $('#mapFallback').hidden = false;
    state.mapAvailable = false;
    return;
  }

  state.mapAvailable = true;
  state.map = window.L.map('map', { zoomControl: true, scrollWheelZoom: false }).setView(MELBOURNE, 12);
  window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap contributors',
  }).addTo(state.map);
  state.markerLayer = window.L.layerGroup().addTo(state.map);
}

function renderMarkers(events) {
  if (!state.mapAvailable) return;
  state.markerLayer.clearLayers();
  state.markers.clear();
  const grouped = new Map();
  for (const event of events) {
    const venue = venueById(event.venueId);
    if (!venue || venue.lat == null || venue.lng == null) continue;
    grouped.set(event.venueId, [...(grouped.get(event.venueId) || []), event]);
  }

  grouped.forEach((items, venueId) => {
    const venue = venueById(venueId);
    const marker = window.L.marker([venue.lat, venue.lng], { icon: markerIcon(false), title: venue.name });
    marker.bindPopup(`<div><small>${escapeHtml(venue.suburb)} · ${escapeHtml(KIND_LABELS[venue.kind])}</small><h3>${escapeHtml(venue.name)}</h3>${items.slice(0, 3).map(item => `<div><strong>${escapeHtml(item.title)}</strong></div>`).join('')}</div>`);
    marker.on('click', () => highlightVenue(venueId, true));
    marker.addTo(state.markerLayer);
    state.markers.set(venueId, marker);
  });
}

function fitVisibleMarkers() {
  if (!state.mapAvailable) return;
  const markers = [...state.markers.values()];
  if (!markers.length) return;
  state.map.fitBounds(window.L.featureGroup(markers).getBounds().pad(.14), { maxZoom: 14 });
}

function highlightVenue(venueId, scroll = false) {
  $$('.result-card').forEach(card => card.classList.toggle('is-selected', card.dataset.venueId === venueId));
  if (state.mapAvailable) state.markers.forEach((marker, id) => marker.setIcon(markerIcon(id === venueId)));
  if (scroll) document.querySelector(`.result-card[data-venue-id="${CSS.escape(venueId)}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function googleDirectionsUrl(venue, travelmode = 'driving') {
  const params = new URLSearchParams({ api: '1', destination: venue.address, travelmode });
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}
function appleDirectionsUrl(venue) { return `https://maps.apple.com/?daddr=${encodeURIComponent(venue.address)}`; }
function wazeDirectionsUrl(venue) { return `https://www.waze.com/ul?q=${encodeURIComponent(venue.address)}&navigate=yes`; }

function renderResults() {
  const events = filteredEvents();
  const mappedVenueIds = new Set(events.map(event => venueById(event.venueId)).filter(venue => venue?.lat != null && venue?.lng != null).map(venue => venue.id));
  $('#resultCount').textContent = events.length;
  $('#resultNoun').textContent = events.length === 1 ? 'show' : 'shows';
  $('#mappedSummary').textContent = events.length ? `· ${mappedVenueIds.size} mapped venues` : '';
  renderMarkers(events);

  if (!events.length) {
    $('#resultsList').innerHTML = '<div class="empty-state"><h3>nothing there.</h3><p>Try widening the filters. “Open today” and “open now” only use venues whose hours have been checked against a first-party source.</p></div>';
    return;
  }

  const clock = melbourneClock();
  $('#resultsList').innerHTML = events.map(event => {
    const venue = venueById(event.venueId);
    const status = statusFor(event, venue);
    const distance = state.userLocation && venue.lat != null && venue.lng != null ? haversineKm(state.userLocation, [venue.lat, venue.lng]) : null;
    const saved = state.saved.has(event.id);
    const inCrawl = state.crawl.has(event.id);
    const futureOpening = event.opening && event.opening.date >= clock.date;
    const sourceLabel = event.sourceType === 'official' ? 'official source' : 'directory source';

    return `<article class="result-card" data-event-id="${escapeAttr(event.id)}" data-venue-id="${escapeAttr(venue.id)}">
      <div class="card-topline">
        <span class="${status.cls}"><span class="status-dot" aria-hidden="true"></span> ${escapeHtml(status.label)}</span>
        <span>·</span><span>${formatDate(event.startDate)}–${formatDate(event.endDate)}</span>
        ${futureOpening ? `<span>· opening ${formatDate(event.opening.date)} ${escapeHtml(formatClockRange(event.opening.start, event.opening.end))}</span>` : ''}
        <span class="source-badge">${sourceLabel}</span>
      </div>
      <h2 class="card-title">${escapeHtml(event.title)}</h2>
      <p class="card-artists">${escapeHtml(event.artists?.join(' · ') || '')}</p>
      <div class="card-venue"><div><strong>${escapeHtml(venue.name)}</strong><br><span>${escapeHtml(venue.suburb)} · ${escapeHtml(KIND_LABELS[venue.kind])}</span></div>${distance !== null ? `<span>${distance.toFixed(distance < 10 ? 1 : 0)} km</span>` : ''}</div>
      <div class="card-actions">
        <button class="card-action js-detail" data-id="${escapeAttr(event.id)}">details</button>
        <button class="card-action js-save ${saved ? 'is-saved' : ''}" data-id="${escapeAttr(event.id)}" aria-pressed="${saved}">${saved ? 'saved' : 'save'}</button>
        <button class="card-action js-crawl is-crawl ${inCrawl ? 'is-added' : ''}" data-id="${escapeAttr(event.id)}" aria-pressed="${inCrawl}">${inCrawl ? 'in crawl' : 'add to crawl'}</button>
        <a class="card-action" href="${escapeAttr(googleDirectionsUrl(venue))}" target="_blank" rel="noopener">navigate</a>
      </div>
    </article>`;
  }).join('');

  wireCards();
}

function wireCards() {
  $$('.result-card').forEach(card => {
    card.addEventListener('mouseenter', () => highlightVenue(card.dataset.venueId));
    card.addEventListener('focusin', () => highlightVenue(card.dataset.venueId));
  });
  $$('.js-detail').forEach(button => button.addEventListener('click', () => showDetail(button.dataset.id)));
  $$('.js-save').forEach(button => button.addEventListener('click', () => toggleSaved(button.dataset.id)));
  $$('.js-crawl').forEach(button => button.addEventListener('click', () => toggleCrawl(button.dataset.id)));
}

function showDetail(eventId) {
  const event = state.events.find(item => item.id === eventId);
  if (!event) return;
  const venue = venueById(event.venueId);
  if (!venue) return;
  const clock = melbourneClock();
  const tags = event.tags?.map(tag => `<span>${escapeHtml(tag)}</span>`).join(' · ') || '—';
  const hoursToday = venue.hoursVerified ? humanHoursForDay(venue, clock.weekday) : 'not verified yet';
  const sourceUrl = safeUrl(event.sourceUrl);
  const venueUrl = safeUrl(venue.website);
  const access = venue.access?.note ? escapeHtml(venue.access.note) : 'not yet verified';

  $('#detailContent').innerHTML = `<div class="detail-body">
    <span class="eyebrow">${escapeHtml(event.eventType)} · ${escapeHtml(KIND_LABELS[venue.kind])}</span>
    <h2 id="detailTitle">${escapeHtml(event.title)}</h2>
    <p>${escapeHtml(event.artists?.join(' · ') || '')}</p>
    <div class="detail-meta">
      <div><strong>when</strong><br>${formatDate(event.startDate, { day: 'numeric', month: 'long' })} – ${formatDate(event.endDate, { day: 'numeric', month: 'long', year: 'numeric' })}${event.opening ? `<br>opening ${formatDate(event.opening.date, { weekday: 'short', day: 'numeric', month: 'short' })}, ${escapeHtml(formatClockRange(event.opening.start, event.opening.end))}` : ''}</div>
      <div><strong>where</strong><br>${escapeHtml(venue.name)}<br>${escapeHtml(venue.address)}</div>
      <div><strong>today's hours</strong><br>${escapeHtml(hoursToday)}${venue.hoursNote ? `<br><small>${escapeHtml(venue.hoursNote)}</small>` : ''}</div>
      <div><strong>access</strong><br>${access}</div>
      <div><strong>admission</strong><br>${escapeHtml(event.admission)}</div>
      <div><strong>tags</strong><br>${tags}</div>
    </div>
    <div class="detail-links">
      ${venueUrl !== '#' ? `<a href="${escapeAttr(venueUrl)}" target="_blank" rel="noopener">venue website</a>` : ''}
      <a href="${escapeAttr(googleDirectionsUrl(venue))}" target="_blank" rel="noopener">google maps</a>
      <a href="${escapeAttr(appleDirectionsUrl(venue))}" target="_blank" rel="noopener">apple maps</a>
      <a href="${escapeAttr(wazeDirectionsUrl(venue))}" target="_blank" rel="noopener">waze · drive</a>
    </div>
    <p class="source-note">Verified ${escapeHtml(event.lastVerified)} from ${escapeHtml(event.sourceName)} (${escapeHtml(event.sourceType)}). ${sourceUrl !== '#' ? `<a href="${escapeAttr(sourceUrl)}" target="_blank" rel="noopener">check source ↗</a>` : ''} Confirm before travelling.</p>
  </div>`;

  const dialog = $('#detailDialog');
  dialog.showModal();
  $('#closeDialogButton').focus();
}

function toggleSaved(id) {
  state.saved.has(id) ? state.saved.delete(id) : state.saved.add(id);
  persistSet('hangabout:saved', state.saved);
  $('#savedCount').textContent = state.saved.size;
  renderResults();
}

function toggleCrawl(id) {
  const event = state.events.find(item => item.id === id);
  if (!event) return;
  if (state.crawl.has(id)) {
    state.crawl.delete(id);
  } else {
    for (const existingId of [...state.crawl]) {
      const existing = state.events.find(item => item.id === existingId);
      if (existing?.venueId === event.venueId) state.crawl.delete(existingId);
    }
    state.crawl.add(id);
  }
  persistSet('hangabout:crawl', state.crawl);
  renderCrawl();
  renderResults();
}

function crawlOrderedEvents() {
  const selected = [...state.crawl].map(id => state.events.find(event => event.id === id)).filter(Boolean);
  if (selected.length < 2) return selected;

  const mapped = selected.filter(event => {
    const venue = venueById(event.venueId);
    return venue?.lat != null && venue?.lng != null;
  });
  const unmapped = selected.filter(event => !mapped.includes(event));
  if (!mapped.length) return selected;

  const remaining = [...mapped];
  const ordered = [];
  let current = state.userLocation || MELBOURNE;
  while (remaining.length) {
    remaining.sort((a, b) => {
      const venueA = venueById(a.venueId);
      const venueB = venueById(b.venueId);
      return haversineKm(current, [venueA.lat, venueA.lng]) - haversineKm(current, [venueB.lat, venueB.lng]);
    });
    const next = remaining.shift();
    ordered.push(next);
    const venue = venueById(next.venueId);
    current = [venue.lat, venue.lng];
  }
  return [...ordered, ...unmapped];
}

function renderCrawl() {
  const ordered = crawlOrderedEvents();
  const tray = $('#crawlTray');
  tray.hidden = ordered.length === 0;
  document.body.classList.toggle('has-crawl', ordered.length > 0);
  $('#crawlCount').textContent = `${ordered.length} ${ordered.length === 1 ? 'stop' : 'stops'}`;
  if (!ordered.length) return;

  const venues = ordered.map(event => venueById(event.venueId)).filter(Boolean);
  const destination = venues.at(-1);
  const waypoints = venues.slice(0, -1).map(venue => venue.address).join('|');
  const params = new URLSearchParams({ api: '1', destination: destination.address, travelmode: $('#routeModeSelect').value });
  if (state.userLocation) params.set('origin', `${state.userLocation[0]},${state.userLocation[1]}`);
  if (waypoints) params.set('waypoints', waypoints);
  $('#googleRouteLink').href = `https://www.google.com/maps/dir/?${params.toString()}`;
}

function venueSearchText(venue) {
  return normalise([
    venue.name, venue.suburb, KIND_LABELS[venue.kind], venue.focus?.join(' '),
    venue.artistPathways?.map(pathway => pathway.label).join(' '), venue.access?.note,
  ].join(' '));
}

function renderVenueDirectory() {
  const q = normalise(state.makeQuery.trim());
  const venues = state.venues.filter(venue => {
    if (state.makeKind !== 'all' && venue.kind !== state.makeKind) return false;
    if (state.pathwaysOnly && !venue.artistPathways?.length) return false;
    if (q && !venueSearchText(venue).includes(q)) return false;
    return true;
  }).sort((a, b) => {
    const orderA = KIND_ORDER.indexOf(a.kind);
    const orderB = KIND_ORDER.indexOf(b.kind);
    return orderA - orderB || a.name.localeCompare(b.name);
  });

  $('#makeCount').textContent = `${venues.length} ${venues.length === 1 ? 'space' : 'spaces'}`;
  $('#venueDirectory').innerHTML = venues.map(venue => {
    const clock = melbourneClock();
    const todayHours = venue.hoursVerified ? humanHoursForDay(venue, clock.weekday) : 'hours not verified';
    const access = venue.access?.note || 'access information not yet verified';
    const focus = venue.focus?.map(item => `<span>${escapeHtml(item)}</span>`).join('') || '';
    const pathways = venue.artistPathways?.length
      ? venue.artistPathways.map(pathway => `<a href="${escapeAttr(safeUrl(pathway.url))}" target="_blank" rel="noopener">${escapeHtml(pathway.label)} ↗</a>`).join('')
      : '<span class="unknown">no verified artist pathway yet</span>';

    return `<article class="venue-card">
      <div class="venue-kind">${escapeHtml(KIND_LABELS[venue.kind])}</div>
      <h3>${escapeHtml(venue.name)}</h3>
      <p>${escapeHtml(venue.suburb)} · ${escapeHtml(venue.address)}</p>
      <div class="venue-focus">${focus}</div>
      <p><strong>today</strong> · ${escapeHtml(todayHours)}</p>
      <p><strong>access</strong> · ${escapeHtml(access)}</p>
      <div class="venue-pathways"><strong>artist pathways</strong>${pathways}</div>
      <a href="${escapeAttr(safeUrl(venue.website))}" target="_blank" rel="noopener">official website ↗</a>
    </article>`;
  }).join('');
}

function renderMode() {
  const see = state.mode === 'see';
  $('.controls').hidden = !see;
  $('.explorer').hidden = !see;
  $('#makePanel').hidden = see;
  $$('.mode-button').forEach(button => {
    const active = button.dataset.mode === state.mode;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-pressed', String(active));
  });
  if (!see) renderVenueDirectory();
  if (see && state.mapAvailable) setTimeout(() => state.map.invalidateSize(), 0);
}

function renderAll() {
  renderMode();
  if (state.mode === 'see') renderResults();
  renderCrawl();
  $('#savedCount').textContent = state.saved.size;
}

function updateQuickFilter(value) {
  state.quick = value;
  $$('#quickFilters .chip').forEach(chip => {
    const active = chip.dataset.quick === value;
    chip.classList.toggle('is-active', active);
    chip.setAttribute('aria-pressed', String(active));
  });
  renderResults();
}

function setStatus(message) { $('#explorerStatus').textContent = message; }

function requestLocation({ setNearby = false, setDistanceSort = false } = {}) {
  if (!navigator.geolocation) {
    setStatus('Location is not available in this browser.');
    return;
  }
  setStatus('Requesting your location…');
  navigator.geolocation.getCurrentPosition(position => {
    state.userLocation = [position.coords.latitude, position.coords.longitude];
    setStatus('Location found. Distance is approximate straight-line distance; navigation apps calculate the route.');
    if (state.mapAvailable) {
      if (state.locationLayer) state.locationLayer.remove();
      state.locationLayer = window.L.circleMarker(state.userLocation, { radius: 7, weight: 2, color: '#11110f', fillColor: '#d7ff3f', fillOpacity: 1 }).addTo(state.map).bindTooltip('you are here');
      state.map.setView(state.userLocation, 13);
    }
    if (setDistanceSort) {
      state.sort = 'distance';
      $('#sortSelect').value = 'distance';
    }
    if (setNearby) updateQuickFilter('nearby'); else renderResults();
    renderCrawl();
  }, () => {
    setStatus('Location permission was not granted. “Within 5 km” and nearest sorting were left off.');
    if (state.quick === 'nearby') updateQuickFilter('all');
    if (state.sort === 'distance') {
      state.sort = 'closing';
      $('#sortSelect').value = 'closing';
      renderResults();
    }
  }, { enableHighAccuracy: false, timeout: 8000, maximumAge: 300000 });
}

function populateKindSelect(select) {
  for (const kind of KIND_ORDER.filter(item => state.venues.some(venue => venue.kind === item))) {
    select.insertAdjacentHTML('beforeend', `<option value="${escapeAttr(kind)}">${escapeHtml(KIND_LABELS[kind])}</option>`);
  }
}

function wireUI() {
  $$('.mode-button').forEach(button => button.addEventListener('click', () => { state.mode = button.dataset.mode; renderAll(); }));
  $('#searchInput').addEventListener('input', event => { state.query = event.target.value; renderResults(); });
  $$('#quickFilters .chip').forEach(chip => chip.addEventListener('click', () => {
    if (chip.dataset.quick === 'nearby' && !state.userLocation) requestLocation({ setNearby: true });
    else updateQuickFilter(chip.dataset.quick);
  }));
  $('#venueTypeSelect').addEventListener('change', event => { state.venueType = event.target.value; renderResults(); });
  $('#sortSelect').addEventListener('change', event => {
    if (event.target.value === 'distance' && !state.userLocation) {
      requestLocation({ setDistanceSort: true });
      return;
    }
    state.sort = event.target.value;
    renderResults();
  });
  $('#savedOnlyButton').addEventListener('click', () => {
    state.savedOnly = !state.savedOnly;
    $('#savedOnlyButton').setAttribute('aria-pressed', String(state.savedOnly));
    renderResults();
  });
  $('#fitMapButton').addEventListener('click', fitVisibleMarkers);
  $('#locateButton').addEventListener('click', () => requestLocation());
  $('#toggleMapButton').addEventListener('click', () => {
    const hidden = $('.explorer').classList.toggle('map-hidden');
    $('#toggleMapButton').setAttribute('aria-expanded', String(!hidden));
    $('#toggleMapButton').textContent = hidden ? 'show map' : 'hide map';
    if (!hidden && state.mapAvailable) setTimeout(() => state.map.invalidateSize(), 0);
  });
  $('#clearCrawlButton').addEventListener('click', () => {
    state.crawl.clear();
    persistSet('hangabout:crawl', state.crawl);
    renderAll();
  });
  $('#routeModeSelect').addEventListener('change', renderCrawl);
  $('#closeDialogButton').addEventListener('click', () => $('#detailDialog').close());
  $('#detailDialog').addEventListener('click', event => { if (event.target === $('#detailDialog')) $('#detailDialog').close(); });

  $('#makeSearchInput').addEventListener('input', event => { state.makeQuery = event.target.value; renderVenueDirectory(); });
  $('#makeKindSelect').addEventListener('change', event => { state.makeKind = event.target.value; renderVenueDirectory(); });
  $('#pathwaysOnlyInput').addEventListener('change', event => { state.pathwaysOnly = event.target.checked; renderVenueDirectory(); });
}

function pruneStoredIds() {
  const eventIds = new Set(state.events.map(event => event.id));
  state.saved = new Set([...state.saved].filter(id => eventIds.has(id)));
  state.crawl = new Set([...state.crawl].filter(id => eventIds.has(id)));
  persistSet('hangabout:saved', state.saved);
  persistSet('hangabout:crawl', state.crawl);
}

function renderDataStamp() {
  const latest = [...state.events.map(event => event.lastVerified), ...state.venues.map(venue => venue.lastVerified)].sort().at(-1);
  const official = state.events.filter(event => event.sourceType === 'official').length;
  const directory = state.events.filter(event => event.sourceType === 'directory').length;
  $('#dataStamp').textContent = `prototype · ${official} official-source listings · ${directory} directory-source listings · last checked ${latest}`;
}

async function boot() {
  const [venuesResponse, eventsResponse] = await Promise.all([fetch('./data/venues.json'), fetch('./data/events.json')]);
  if (!venuesResponse.ok || !eventsResponse.ok) throw new Error('Could not load hangabout data');
  [state.venues, state.events] = await Promise.all([venuesResponse.json(), eventsResponse.json()]);
  pruneStoredIds();

  const clock = melbourneClock();
  $('#dateLabel').textContent = formatDate(clock.date, { weekday: 'short', day: 'numeric', month: 'short' }).toLowerCase();
  initialiseMap();
  populateKindSelect($('#venueTypeSelect'));
  populateKindSelect($('#makeKindSelect'));
  wireUI();
  renderDataStamp();
  renderAll();
  requestAnimationFrame(fitVisibleMarkers);
}

boot().catch(error => {
  console.error(error);
  $('#resultsList').innerHTML = '<div class="empty-state"><h3>the listings didn\'t load.</h3><p>Please refresh the page. If this persists, the data files may be unavailable.</p></div>';
  setStatus('The data bundle could not be loaded.');
});
