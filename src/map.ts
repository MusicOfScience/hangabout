import L, { Map as LeafletMap, LayerGroup, Marker } from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { Dataset, Event, MakeResource, Venue } from './types';
import { exactVenuePoint, haversine, MELBOURNE, resourcePoint, type Point } from './geo';

const TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';

export interface DiscoveredPlace {
  id: string;
  name: string;
  point: Point;
  category: string;
  website?: string;
  address?: string;
}

function divIcon(label: string, className: string) {
  return L.divIcon({
    className: '',
    html: `<span class="${className}">${label}</span>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
  });
}

export class SeeMap {
  private map: LeafletMap;
  private layer: LayerGroup;
  private discoveryLayer: LayerGroup;
  private locationMarker: Marker | null = null;
  private onMoved: () => void;
  private canonicalVenues: Array<{ name: string; point: Point }> = [];

  constructor(element: HTMLElement, onMoved: () => void) {
    this.onMoved = onMoved;
    this.map = L.map(element, { scrollWheelZoom: false, zoomControl: true }).setView(MELBOURNE, 11);
    L.tileLayer(TILE_URL, {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(this.map);
    this.layer = L.layerGroup().addTo(this.map);
    this.discoveryLayer = L.layerGroup().addTo(this.map);
    this.map.on('moveend', () => {
      this.onMoved();
      window.dispatchEvent(new CustomEvent('hangabout:see-map-moved', {
        detail: { bounds: this.bounds(), center: this.center() },
      }));
    });
    window.hangaboutSeeMap = this;
  }

  render(events: Event[], dataset: Dataset, focus = false) {
    this.layer.clearLayers();
    const venueById = new Map(dataset.venues.map(v => [v.id, v]));
    const venues = new Map<string, Venue>();
    for (const event of events) {
      const venue = venueById.get(event.venueId);
      if (venue) venues.set(venue.id, venue);
    }

    this.canonicalVenues = dataset.venues
      .map(venue => ({ venue, point: exactVenuePoint(venue) }))
      .filter((item): item is { venue: Venue; point: Point } => Boolean(item.point))
      .map(item => ({ name: item.venue.name, point: item.point }));

    const markers: Marker[] = [];
    for (const venue of venues.values()) {
      const point = exactVenuePoint(venue);
      if (!point) continue;
      const count = events.filter(event => event.venueId === venue.id).length;
      const marker = L.marker(point, {
        icon: divIcon(String(count), 'venue-pin'),
        title: venue.name,
      }).addTo(this.layer);
      marker.bindPopup(`<strong>${escapeHtml(venue.name)}</strong><br>${escapeHtml(venue.suburb)}<br>${count} ${count === 1 ? 'show' : 'shows'}<br><small>verified hangabout venue</small>`);
      markers.push(marker);
    }

    if (focus && markers.length) {
      const bounds = L.featureGroup(markers).getBounds();
      if (bounds.isValid()) this.map.fitBounds(bounds.pad(.12), { maxZoom: 15 });
    }
  }

  setDiscoveries(places: DiscoveredPlace[]): number {
    this.discoveryLayer.clearLayers();
    const rendered = places.filter(place => !this.matchesCanonical(place));
    const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#b8ff2c';

    for (const place of rendered) {
      const marker = L.circleMarker(place.point, {
        radius: 8,
        color: accent,
        weight: 5,
        fillColor: '#f2efe7',
        fillOpacity: .18,
        opacity: 1,
        className: 'discovery-marker',
      }).addTo(this.discoveryLayer);

      const website = safeExternalUrl(place.website);
      marker.bindPopup([
        `<strong>${escapeHtml(place.name)}</strong>`,
        `<span>possible art place · ${escapeHtml(place.category)}</span>`,
        place.address ? `<span>${escapeHtml(place.address)}</span>` : '',
        website ? `<a href="${escapeHtml(website)}" target="_blank" rel="noopener">website ↗</a>` : '',
        '<small>OpenStreetMap discovery · not yet a verified hangabout listing</small>',
      ].filter(Boolean).join('<br>'));
    }

    return rendered.length;
  }

  clearDiscoveries() {
    this.discoveryLayer.clearLayers();
  }

  private matchesCanonical(place: DiscoveredPlace): boolean {
    const name = normaliseName(place.name);
    return this.canonicalVenues.some(venue =>
      normaliseName(venue.name) === name || haversine(venue.point, place.point) < 0.06
    );
  }

  bounds() {
    const b = this.map.getBounds();
    return { north: b.getNorth(), south: b.getSouth(), east: b.getEast(), west: b.getWest() };
  }

  center(): Point {
    const c = this.map.getCenter();
    return [c.lat, c.lng];
  }

  fitAll(dataset: Dataset) {
    const points = dataset.venues.map(exactVenuePoint).filter((p): p is Point => Boolean(p));
    if (!points.length) return;
    this.map.fitBounds(L.latLngBounds(points), { padding: [20, 20], maxZoom: 13 });
  }

  setUserLocation(point: Point) {
    if (this.locationMarker) this.locationMarker.remove();
    this.locationMarker = L.marker(point, {
      icon: divIcon('•', 'you-pin'),
      title: 'you are here',
    }).addTo(this.map);
    this.map.setView(point, 13);
  }

  invalidate() {
    requestAnimationFrame(() => this.map.invalidateSize());
  }
}

export class MakeMap {
  private map: LeafletMap;
  private layer: LayerGroup;
  private locationMarker: Marker | null = null;

  constructor(element: HTMLElement, private readonly onSuburb: (suburb: string) => void) {
    this.map = L.map(element, { scrollWheelZoom: false, zoomControl: true }).setView(MELBOURNE, 11);
    L.tileLayer(TILE_URL, {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(this.map);
    this.layer = L.layerGroup().addTo(this.map);
  }

  render(resources: MakeResource[]) {
    this.layer.clearLayers();
    const groups = new Map<string, { suburb: string; point: Point; count: number }>();
    for (const resource of resources) {
      const point = resourcePoint(resource);
      if (!point) continue;
      const key = resource.suburb.toLowerCase();
      const existing = groups.get(key);
      if (existing) existing.count += 1;
      else groups.set(key, { suburb: resource.suburb, point, count: 1 });
    }

    const markers: Marker[] = [];
    for (const group of groups.values()) {
      const marker = L.marker(group.point, {
        icon: divIcon(String(group.count), 'resource-pin'),
        title: `${group.suburb}: ${group.count} resources`,
      }).addTo(this.layer);
      marker.bindPopup(`<strong>${escapeHtml(group.suburb)}</strong><br>${group.count} ${group.count === 1 ? 'resource' : 'resources'}`);
      marker.on('click', () => this.onSuburb(group.suburb));
      markers.push(marker);
    }
    if (markers.length) {
      const bounds = L.featureGroup(markers).getBounds();
      if (bounds.isValid()) this.map.fitBounds(bounds.pad(.15), { maxZoom: 12 });
    }
  }

  setUserLocation(point: Point) {
    if (this.locationMarker) this.locationMarker.remove();
    this.locationMarker = L.marker(point, {
      icon: divIcon('•', 'you-pin'),
      title: 'you are here',
    }).addTo(this.map);
    this.map.setView(point, 13);
  }

  invalidate() {
    requestAnimationFrame(() => this.map.invalidateSize());
  }
}

function normaliseName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
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

declare global {
  interface Window {
    hangaboutSeeMap?: SeeMap;
  }
}
