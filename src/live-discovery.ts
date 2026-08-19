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

const OVERPASS_ENDPOINT = 'https://overpass-api.de/api/interpreter';
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

  if (!map || !searchArea || !clearArea || !fitMap || !webLinks || !webArea || !mappedCount || !status || !webDiscovery) {
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

  const key = document.createElement('p');
  key.className = 'discovery-key';
  key.innerHTML = '<span class="discovery-key-dot" aria-hidden="true"></span> lime-ring pins are OpenStreetMap art-place discoveries, not yet verified hangabout listings';
  webDiscovery.appendChild(key);

  let currentAreaLabel: string | null = 'Melbourne';
  let searchSequence = 0;

  const clearLive = (message = '') => {
    map.clearDiscoveries();
    discoveryCount.textContent = '';
    discoveryStatus.textContent = message;
  };

  window.addEventListener('hangabout:see-map-moved', () => {
    currentAreaLabel = null;
    webArea.textContent = 'this map area';
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
    clearLive('looking for galleries and art places in this map area…');

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
      discoveryStatus.textContent = rendered
        ? `${rendered} additional art ${rendered === 1 ? 'place' : 'places'} discovered from OpenStreetMap in this viewport`
        : 'no additional OpenStreetMap art places found in this viewport';
    } catch (error) {
      if (sequence !== searchSequence) return;
      const label = await resolveAreaLabel(center, bounds).catch(() => fallbackAreaLabel(center));
      currentAreaLabel = label;
      webArea.textContent = label;
      discoveryStatus.textContent = error instanceof Error
        ? error.message
        : 'live art-place discovery is temporarily unavailable';
    }
  });

  webLinks.addEventListener('click', async event => {
    const target = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-web]');
    if (!target) return;
    event.preventDefault();
    event.stopImmediatePropagation();

    const bounds = map.bounds();
    const center = map.center();
    const area = currentAreaLabel ?? await resolveAreaLabel(center, bounds).catch(() => fallbackAreaLabel(center));
    currentAreaLabel = area;
    webArea.textContent = area;
    window.open(googleSearchUrl(target.dataset.web as WebDiscoveryKind, area), '_blank', 'noopener');
  }, true);
}

async function discoverArtPlaces(bounds: Bounds): Promise<DiscoveredPlace[]> {
  const latSpan = Math.abs(bounds.north - bounds.south);
  const lonSpan = Math.abs(bounds.east - bounds.west);
  if (latSpan > 15 || lonSpan > 15) {
    throw new Error('zoom in a little before live discovery · this search is designed for a city or region, not a continent');
  }

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
  const query = `[out:json][timeout:22];(
    nwr["tourism"="gallery"]["name"](${bbox});
    nwr["amenity"="arts_centre"]["name"](${bbox});
    nwr["amenity"="exhibition_centre"]["name"](${bbox});
    nwr["shop"="art"]["name"](${bbox});
    nwr["tourism"="museum"]["name"~"art|gallery|photograph|design",i](${bbox});
  );out center tags;`;

  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 28000);
  try {
    const response = await fetch(OVERPASS_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
      body: `data=${encodeURIComponent(query)}`,
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`live art-place discovery returned ${response.status}; try again shortly`);
    const payload = await response.json() as OverpassResponse;
    return parseOverpass(payload.elements ?? []).slice(0, 600);
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error('live art-place discovery timed out · try a smaller map area');
    }
    throw error;
  } finally {
    window.clearTimeout(timer);
  }
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
  if (tags.shop === 'art') return 'art shop / possible commercial gallery';
  if (tags.tourism === 'museum') return 'art / design museum candidate';
  return 'art place';
}

function address(tags: Record<string, string>): string | undefined {
  const street = [tags['addr:housenumber'], tags['addr:street']].filter(Boolean).join(' ');
  const locality = tags['addr:suburb'] ?? tags['addr:city'] ?? tags['addr:town'] ?? tags['addr:village'];
  const value = [street, locality, tags['addr:postcode']].filter(Boolean).join(', ');
  return value || undefined;
}

async function resolveAreaLabel(center: Point, bounds: Bounds): Promise<string> {
  const span = Math.max(Math.abs(bounds.north - bounds.south), Math.abs(bounds.east - bounds.west));
  const zoom = span > 4 ? 5 : span > 1.5 ? 8 : span > .55 ? 10 : span > .18 ? 12 : 13;
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
    const payload = await response.json() as { address?: Record<string, string>; name?: string; display_name?: string };
    const a = payload.address ?? {};
    return a.suburb ?? a.city_district ?? a.city ?? a.town ?? a.village ?? a.municipality ?? a.county ?? a.state ?? payload.name ?? fallbackAreaLabel(center);
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

function fallbackAreaLabel(center: Point): string {
  if (haversine(center, MELBOURNE) < 85) return 'Melbourne';
  const [lat, lng] = center;
  if (lat <= -33.5 && lat >= -39.5 && lng >= 140.5 && lng <= 150.3) return 'Victoria';
  return 'Australia';
}

function boundsKey(bounds: Bounds): string {
  return [bounds.south, bounds.west, bounds.north, bounds.east].map(value => value.toFixed(3)).join(',');
}

boot();
