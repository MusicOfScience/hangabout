import { dateDiff, weekendDates, clockStringToMinutes, openingWithinDays, isoToUtc } from './lib/time.js';

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
const OSM_TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
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
  return openingWithinDays(event.opening, melbourneClock(), 7);
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
  if (event.opening?.date === clock.date && clockStringToMinutes(event.opening.end) > clock.minutes) {
    return { label: `opening today · ${formatClockRange(event.opening.start, event.opening.end)}`, cls: 'status-open' };
  }
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
  window.L.tileLayer(OSM_TILE_URL, {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap contributors</a>',
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

function googleDirectionsUrl(venue, travelmode = null) {
  const params = new URLSearchParams({ api: '1', destination: venue.address });
  if (travelmode) params.set('travelmode', travelmode);
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
        <span class="${status.cls}"