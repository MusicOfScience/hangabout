import type { DiscoveredPlace, SeeMap } from './map';
import { googleSearchUrl, type WebDiscoveryKind } from './discovery';
import { haversine, MELBOURNE, type Point } from './geo';

interface Bounds {
  north: number;
  south: number;
  east: number;
  west: number;
}

interface OverpassElement {
  type: string;
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

interface OverpassResponse {
  elements?: OverpassElement[];
}

const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];
const NOMINATIM_ENDPOINT = 'https://nominatim.openstreetmap.org/reverse';
const discoveryCache = new Map<string, Promise<DiscoveredPlace[]>>();
const labelCache = new Map<string, Promise<string>>();
let nominatimQueue: Promise<void> = Promise.resolve();
let lastNominatimRequest = 0;

function boot(attempt = 0) {
  const map = window.hangaboutSeeMap;
  const searchArea = document.querySelector<HTMLButtonElement>('#searchArea');
  const clearArea = document.querySelector<HTMLButtonElement>('#clearArea');
  const fitMap = document.querySelector<HTMLButtonElement>('#fitMap');
  const webLinks = document.querySelector<HTMLElement>('.web-links');
  const webArea = document.querySelector<HTMLElement>('#webSuburb');
  const mappedCount = document.querySelector<HTMLElement>('#mappedCount');
  const status = document.querySelector<HTMLElement>('#status');
  const webDiscovery = document.querySelector<HTMLElement>('.web-discovery');
  const areaDiscovery = document.querySelector<HTMLElement>('#areaDiscovery');
  const liveAreaResults = document.querySelector<HTMLElement>('#liveAreaResults');

  if (!map || !searchArea || !clearArea || !fitMap || !webLinks || !webArea || !mappedCount || !status || !webDiscovery || !areaDiscovery || !liveAreaResults) {
    if (attempt < 90) window.setTimeout(() => boot(attempt + 1), 50);
    return;
  }

  const discoveryCount = document.createElement('span');
  discoveryCount.id = 'liveDiscoveryCount';
  discoveryCount.className = 'live-discovery-count';
  mappedCount.insertAdjacentElement('afterend', discoveryCount);

  const discoveryStatus = document.createElement('div');
  discoveryStatus.id = 'liveDiscoveryStatus';
  discoveryStatus.className = 'live-discovery-status';
  status.insertAdjacentElement('afterend', discoveryStatus);

  const key = document.createElement('div');
  key.className = 'discovery-key';
  key.innerHTML = `
    <span><span class="known-key-dot" aria-hidden="true"></span> outlined grey = known gallery/art place; hangabout has not yet ingested its current programme</span>
    <span><span class="discovery-key-dot" aria-hidden="true"></span> hollow lime = live OpenStreetMap discovery; not yet verified by hangabout</span>
  `;
  webDiscovery.appendChild(key);

  let currentAreaLabel: string | null = 'Melbourne';
  let searchSequence = 0;

  const clearLive = (message = '') => {
    map.clearDiscoveries();
    discoveryCount.textContent = '';
    discoveryStatus.textContent = message;
    if (message) liveAreaResults.innerHTML = `<p class="area-place-message">${escapeHtml(message)}</p>`;
    else liveAreaResults.innerHTML = '';
  };

  window.addEventListener('hangabout:see-map-moved', () => {
    currentAreaLabel = null;
    webArea.textContent = 'this map area';
    areaDiscovery.hidden = true;
    clearLive('map moved · tap “search this area” to discover art places here');
  });

  clearArea.addEventListener('click', () => {
    currentAreaLabel = 'Melbourne';
    webArea.textContent = 'Melbourne';
    clearLive();
  });

  fitMap.addEventListener('click', () => {
    currentAreaLabel = 'Melbourne';
    webArea.textContent = 'Melbourne';
    clearLive();
  });

  searchArea.addEventListener('click', async () => {
    const sequence = ++searchSequence;
    const bounds = map.bounds();
    const center = map.center();
    const span = viewportSpan(bounds);

    if (span.lat > 1.25 || span.lon > 1.7) {
      const label = regionalAreaLabel(center);
      currentAreaLabel = label;
      webArea.textContent = label;
      areaDiscovery.hidden = false;
      clearLive(`regional view · known public galleries remain visible from the cached statewide layer. Zoom into a town or city and tap “search this area” for additional live OSM discovery; the web searches below now target ${label}.`);
      return;
    }

    clearLive('looking for galleries and art places in this map area…');
    areaDiscovery.hidden = false;

    try {
      const [places, label] = await Promise.all([
        discoverArtPlaces(bounds),
        resolveAreaLabel(center, bounds),
      ]);
      if (sequence !== searchSequence) return;

      currentAreaLabel = label;
      webArea.textContent = label;
      const rendered = map.setDiscoveries(places);
      discoveryCount.textContent = rendered ? ` · ${rendered} discovered art ${rendered === 1 ? 'place' : 'places'}` : '';
      discoveryStatus.textContent = places.length
        ? `${places.length} OpenStreetMap art-place candidates found in this viewport · ${rendered} are not already matched to hangabout`
        : 'OpenStreetMap returned no additional art-place candidates for this viewport · try the web exhibition/gallery searches below';
      renderLivePlaces(liveAreaResults, places);
    } catch (error) {
      if (sequence !== searchSequence) return;
      const label = await resolveAreaLabel(center, bounds).catch(() => regionalAreaLabel(center));
      currentAreaLabel = label;
      webArea.textContent = label;
      discoveryStatus.textContent = error instanceof Error
        ? error.message
        : 'live art-place discovery is temporarily unavailable';
      liveAreaResults.innerHTML = `<p class="area-place-message">${escapeHtml(discoveryStatus.textContent)} The exhibition and gallery searches above still target this area.</p>`;
    }
  });

  webLinks.addEventListener('click', async event => {
    const target = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-web]');
    if (!target) return;
    event.preventDefault();
    event.stopImmediatePropagation();

    const bounds = map.bounds();
    const center = map.center();
    const area = currentAreaLabel ?? await resolveAreaLabel(center, bounds).catch(() => regionalAreaLabel(center));
    currentAreaLabel = area;
    webArea.textContent = area;
    window.open(googleSearchUrl(target.dataset.web as WebDiscoveryKind, area), '_blank', 'noopener');
  }, true);
}

async function discoverArtPlaces(bounds: Bounds): Promise<DiscoveredPlace[]> {
  const key = boundsKey(bounds);
  const cached = discoveryCache.get(key);
  if (cached) return cached;

  const request = fetchOverpass(bounds);
  discoveryCache.set(key, request);
  if (discoveryCache.size > 12) discoveryCache.delete(discoveryCache.keys().next().value as string);
  return request;
}

async function fetchOverpass(bounds: Bounds): Promise<DiscoveredPlace[]> {
  const bbox = `${bounds.south},${bounds.west},${bounds.north},${bounds.east}`;
  const span = Math.max(Math.abs(bounds.north - bounds.south), Math.abs(bounds.east - bounds.west));
  const nameFallback = span <= 1.15
    ? `nwr["name"~"gallery|galleries|art centre|arts centre|art center|arts center|art space|arts space|artist run|artist-run|contemporary art|photography gallery|print studio",i](${bbox});`
    : '';

  const query = `[out:json][timeout:12];(
    nwr["tourism"="gallery"]["name"](${bbox});
    nwr["amenity"="arts_centre"]["name"](${bbox});
    nwr["amenity"="exhibition_centre"]["name"](${bbox});
    nwr["amenity"="community_centre"]["name"~"art|arts|gallery",i](${bbox});
    nwr["shop"="art"]["name"](${bbox});
    nwr["craft"="artist"]["name"](${bbox});
    nwr["studio"="art"]["name"](${bbox});
    nwr["tourism"="museum"]["museum"~"art|design|photography",i]["name"](${bbox});
    nwr["tourism"="museum"]["name"~"art|gallery|photograph|design",i](${bbox});
    ${nameFallback}
  );out center tags;`;

  let lastError: unknown;
  for (const endpoint of OVERPASS_ENDPOINTS) {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 9000);
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
        body: `data=${encodeURIComponent(query)}`,
        signal: controller.signal,
      });
      if (!response.ok) {
        lastError = new Error(`live art-place discovery returned ${response.status}`);
        continue;
      }
      const payload = await response.json() as OverpassResponse;
      return parseOverpass(payload.elements ?? []).slice(0, 500);
    } catch (error) {
      lastError = error;
    } finally {
      window.clearTimeout(timer);
    }
  }

  if (lastError instanceof DOMException && lastError.name === 'AbortError') {
    throw new Error('live OSM discovery is slow here · use the web gallery/exhibition searches below, or zoom in further and try again');
  }
  throw new Error('live OSM discovery is temporarily unavailable · use the web searches below');
}

function parseOverpass(elements: OverpassElement[]): DiscoveredPlace[] {
  const byId = new Map<string, DiscoveredPlace>();
  for (const element of elements) {
    const tags = element.tags ?? {};
    const name = tags.name?.trim();
    const lat = element.lat ?? element.center?.lat;
    const lng = element.lon ?? element.center?.lon;
    if (!name || lat == null || lng == null) continue;

    const id = `${element.type}/${element.id}`;
    byId.set(id, {
      id,
      name,
      point: [lat, lng],
      category: category(tags),
      website: tags.website ?? tags['contact:website'],
      address: address(tags),
    });
  }
  return [...byId.values()];
}

function category(tags: Record<string, string>): string {
  if (tags.tourism === 'gallery') return 'gallery';
  if (tags.amenity === 'arts_centre') return 'arts centre';
  if (tags.amenity === 'exhibition_centre') return 'exhibition centre';
  if (tags.amenity === 'community_centre') return 'community art centre candidate';
  if (tags.shop === 'art') return 'art shop / possible commercial gallery';
  if (tags.craft === 'artist') return 'artist / studio candidate';
  if (tags.studio === 'art') return 'art studio candidate';
  if (tags.tourism === 'museum') return 'art / design museum candidate';
  return 'name-matched art place candidate';
}

function address(tags: Record<string, string>): string | undefined {
  const street = [tags['addr:housenumber'], tags['addr:street']].filter(Boolean).join(' ');
  const locality = tags['addr:suburb'] ?? tags['addr:city'] ?? tags['addr:town'] ?? tags['addr:village'];
  const value = [street, locality, tags['addr:postcode']].filter(Boolean).join(', ');
  return value || undefined;
}

async function resolveAreaLabel(center: Point, bounds: Bounds): Promise<string> {
  const span = Math.max(Math.abs(bounds.north - bounds.south), Math.abs(bounds.east - bounds.west));
  const zoom = span > 6 ? 4 : span > 1.25 ? 6 : span > .55 ? 10 : span > .18 ? 12 : 13;
  const key = `${center[0].toFixed(3)},${center[1].toFixed(3)},${zoom}`;
  const cached = labelCache.get(key);
  if (cached) return cached;

  const request = queueNominatim(async () => {
    const url = new URL(NOMINATIM_ENDPOINT);
    url.searchParams.set('format', 'jsonv2');
    url.searchParams.set('lat', String(center[0]));
    url.searchParams.set('lon', String(center[1]));
    url.searchParams.set('zoom', String(zoom));
    url.searchParams.set('addressdetails', '1');
    url.searchParams.set('layer', 'address');
    url.searchParams.set('accept-language', 'en-AU,en');

    const response = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error('area label unavailable');
    const payload = await response.json() as { address?: Record<string, string>; name?: string };
    const a = payload.address ?? {};
    const locality = a.suburb ?? a.city_district ?? a.city ?? a.town ?? a.village ?? a.municipality ?? a.county ?? payload.name;
    const state = a.state;
    return [locality, state].filter(Boolean).join(', ') || regionalAreaLabel(center);
  });

  labelCache.set(key, request);
  if (labelCache.size > 30) labelCache.delete(labelCache.keys().next().value as string);
  return request;
}

function queueNominatim<T>(task: () => Promise<T>): Promise<T> {
  let resolveResult!: (value: T | PromiseLike<T>) => void;
  let rejectResult!: (reason?: unknown) => void;
  const result = new Promise<T>((resolve, reject) => {
    resolveResult = resolve;
    rejectResult = reject;
  });

  nominatimQueue = nominatimQueue.then(async () => {
    const wait = Math.max(0, 1100 - (Date.now() - lastNominatimRequest));
    if (wait) await new Promise(resolve => window.setTimeout(resolve, wait));
    lastNominatimRequest = Date.now();
    try {
      resolveResult(await task());
    } catch (error) {
      rejectResult(error);
    }
  });

  return result;
}

function viewportSpan(bounds: Bounds) {
  return {
    lat: Math.abs(bounds.north - bounds.south),
    lon: Math.abs(bounds.east - bounds.west),
  };
}

function regionalAreaLabel(center: Point): string {
  const [lat, lng] = center;
  if (lat <= -35.12 && lat >= -35.92 && lng >= 148.75 && lng <= 149.4) return 'Australian Capital Territory';
  if (lat <= -34 && lat >= -39.5 && lng >= 140.5 && lng <= 150.3) return 'Victoria';
  if (haversine(center, MELBOURNE) < 85) return 'Melbourne, Victoria';
  return 'Australia';
}

function renderLivePlaces(container: HTMLElement, places: DiscoveredPlace[]) {
  if (!places.length) {
    container.innerHTML = '<p class="area-place-message">No additional OpenStreetMap art places were returned for this view.</p>';
    return;
  }
  container.innerHTML = places.slice(0, 40).map(place => {
    const website = safeExternalUrl(place.website);
    return `
      <article class="area-place">
        <div><strong>${escapeHtml(place.name)}</strong><span>${escapeHtml(place.category)}${place.address ? ` · ${escapeHtml(place.address)}` : ''}</span></div>
        ${website ? `<a href="${escapeHtml(website)}" target="_blank" rel="noopener">website ↗</a>` : '<span>OpenStreetMap candidate</span>'}
      </article>
    `;
  }).join('');
}

function safeExternalUrl(value?: string): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) ? url.toString() : null;
  } catch {
    return null;
  }
}

function escapeHtml(value: string): string {
  const entities: Record<string, string> = {
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;',
  };
  return value.replace(/[&<>"']/g, char => entities[char] ?? char);
}

function boundsKey(bounds: Bounds): string {
  return [bounds.south, bounds.west, bounds.north, bounds.east].map(value => value.toFixed(3)).join(',');
}

boot();
