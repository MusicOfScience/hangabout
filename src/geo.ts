import type { Dataset, MakeResource, Venue } from './types';

export type Point = [number, number];

export const MELBOURNE: Point = [-37.8136, 144.9631];

// Approximate fallback centres for make-art resources and area labels;
// exhibition pins still require provenance-backed exact/building coordinates.
const SUBURB_CENTRES: Record<string, Point> = {
  'abbotsford': [-37.8024, 144.9982],
  'aberfeldie': [-37.7590, 144.8980],
  'armadale': [-37.8562, 145.0194],
  'beaumaris': [-37.9860, 145.0350],
  'box hill': [-37.8197, 145.1269],
  'brighton': [-37.9050, 145.0027],
  'brunswick': [-37.7662, 144.9594],
  'brunswick east': [-37.7710, 144.9770],
  'bulleen': [-37.7660, 145.0830],
  'burwood': [-37.8500, 145.1190],
  'bundoora': [-37.6980, 145.0590],
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
  'newport': [-37.8430, 144.8840],
  'north melbourne': [-37.7990, 144.9550],
  'northcote': [-37.7710, 145.0000],
  'port melbourne': [-37.8330, 144.9470],
  'prahran': [-37.8510, 144.9930],
  'preston': [-37.7420, 145.0080],
  'richmond': [-37.8190, 145.0010],
  'ringwood': [-37.8150, 145.2280],
  'southbank': [-37.8240, 144.9680],
  'st kilda': [-37.8670, 144.9800],
  'west melbourne': [-37.8060, 144.9490],
  'werribee': [-37.9000, 144.6620],
  'wheelers hill': [-37.9100, 145.1900],
};

const norm = (value: string) => value.trim().toLowerCase();

export function venuePoint(venue: Venue): Point | null {
  if (venue.lat != null && venue.lng != null) return [venue.lat, venue.lng];
  return SUBURB_CENTRES[norm(venue.suburb)] ?? null;
}

export function exactVenuePoint(venue: Venue): Point | null {
  return venue.lat != null && venue.lng != null ? [venue.lat, venue.lng] : null;
}

export function resourcePoint(resource: MakeResource): Point | null {
  if (resource.lat != null && resource.lng != null) return [resource.lat, resource.lng];
  return SUBURB_CENTRES[norm(resource.suburb)] ?? null;
}

export function haversine(a: Point, b: Point): number {
  const R = 6371;
  const toRad = (degrees: number) => degrees * Math.PI / 180;
  const dLat = toRad(b[0] - a[0]);
  const dLon = toRad(b[1] - a[1]);
  const lat1 = toRad(a[0]);
  const lat2 = toRad(b[0]);
  const h = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function nearestSuburb(point: Point, dataset: Dataset): string {
  const candidates = [...new Set([
    ...dataset.venues.map(v => v.suburb),
    ...dataset.resources.map(r => r.suburb),
  ])].filter(Boolean);

  let best = 'Melbourne';
  let distance = Infinity;
  for (const suburb of candidates) {
    const p = SUBURB_CENTRES[norm(suburb)];
    if (!p) continue;
    const d = haversine(point, p);
    if (d < distance) {
      distance = d;
      best = suburb;
    }
  }
  return best;
}
