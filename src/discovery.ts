import type { Point } from './geo';

export type WebDiscoveryKind = 'galleries' | 'exhibitions' | 'openings' | 'everything';

const terms: Record<WebDiscoveryKind, string> = {
  galleries: '("art gallery" OR gallery OR "art space" OR "artist run" OR "artist-run" OR "project space")',
  exhibitions: '(exhibition OR exhibitions OR "art exhibition" OR "current exhibition" OR "group show" OR "solo show")',
  openings: '("gallery opening" OR "opening night" OR "art opening" OR "exhibition opening")',
  everything: '(gallery OR exhibition OR "art space" OR "artist run" OR "project space" OR "gallery opening")',
};

export function googleSearchUrl(kind: WebDiscoveryKind, suburb: string): string {
  const query = `${terms[kind]} "${suburb}" Melbourne`;
  return `https://www.google.com/search?q=${encodeURIComponent(query)}`;
}

export function mapsUrl(address: string, provider: 'google' | 'apple' | 'waze'): string {
  const q = encodeURIComponent(address);
  if (provider === 'apple') return `https://maps.apple.com/?q=${q}`;
  if (provider === 'waze') return `https://www.waze.com/ul?q=${q}&navigate=yes`;
  return `https://www.google.com/maps/search/?api=1&query=${q}`;
}

export function googleCrawlUrl(addresses: string[], mode: 'walking' | 'bicycling' | 'driving'): string | null {
  if (!addresses.length) return null;
  if (addresses.length === 1) {
    return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(addresses[0]!)}&travelmode=${mode}`;
  }
  const origin = encodeURIComponent(addresses[0]!);
  const destination = encodeURIComponent(addresses[addresses.length - 1]!);
  const waypoints = addresses.slice(1, -1).slice(0, 8).map(encodeURIComponent).join('|');
  return `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${destination}&waypoints=${waypoints}&travelmode=${mode}`;
}

export function pointInsideBounds(point: Point, bounds: { north: number; south: number; east: number; west: number }): boolean {
  const [lat, lng] = point;
  return lat <= bounds.north && lat >= bounds.south && lng <= bounds.east && lng >= bounds.west;
}
