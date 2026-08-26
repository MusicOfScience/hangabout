import L, { Map as LeafletMap, LayerGroup, Marker } from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { Dataset, Event, KnownArtPlace, MakeResource, Venue } from './types';
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
  private knownLayer: LayerGroup;
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
    this.knownLayer = L.layerGroup().addTo(this.map);
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
    this.knownLayer.clearLayers();
    const venueById = new Map(dataset.venues.map(v => [v.id, v]));
    const venues = new Map<string, Venue>();
    const eventsByVenue = new Map<string, Event[]>();
    for (const event of events) {
      const venue = venueById.get(event.venueId);
      if (!venue) continue;
      venues.set(venue.id, venue);
      const venueEvents = eventsByVenue.get(venue.id);
      if (venueEvents) venueEvents.push(event);
      else eventsByVenue.set(venue.id, [event]);
    }

    this.canonicalVenues = dataset.venues
      .map(venue => ({ venue, point: exactVenuePoint(venue) }))
      .filter((item): item is { venue: Venue; point: Point } => Boolean(item.point))
      .map(item => ({ name: item.venue.name, point: item.point }));

    this.renderKnownPlaces(dataset.knownPlaces);

    const markers: Marker[] = [];
    for (const venue of venues.values()) {
      const point = exactVenuePoint(venue);
      if (!point) continue;
      const venueEvents = eventsByVenue.get(venue.id) ?? [];
      const count = venueEvents.length;
      const marker = L.marker(point, {
        icon: divIcon(String(count), 'venue-pin'),
        title: venue.name,
      }).addTo(this.layer);
      const listings = venueEvents.map(event => {
        const source = safeExternalUrl(event.sourceUrl);
        return [
          '<li>',
          `<strong>${escapeHtml(event.title)}</strong>`,
          '<span class="popup-links">',
          `<a href="#event-${escapeHtml(event.id)}">show in list ↓</a>`,
          source ? `<a href="${escapeHtml(source)}" target="_blank" rel="noopener">exhibition page ↗</a>` : '',
          '</span>',
          '</li>',
        ].join('');
      }).join('');
      marker.bindPopup([
        `<strong>${escapeHtml(venue.name)}</strong>`,
        `<span>${escapeHtml(venue.suburb)} · ${count} ${count === 1 ? 'show' : 'shows'}</span>`,
        `<ul class="popup-listings">${listings}</ul>`,
      ].join('<br>'), { maxWidth: 330, minWidth: 240 });
      markers.push(marker);
    }

    if (focus && markers.length) {
      const bounds = L.featureGroup(markers).getBounds();
      if (bounds.isValid()) this.map.fitBounds(bounds.pad(.12), { maxZoom: 15 });
    }
  }

  private renderKnownPlaces(places: KnownArtPlace[]) {
    for (const place of places) {
      const point: Point = [place.lat, place.lng];
      if (this.matchesCanonicalNameOrPoint(place.name, point)) continue;

      const marker = L.circleMarker(point, {
        radius: 6,
        color: '#5f5d57',
        weight: 2,
        fillColor: '#f2efe7',
        fillOpacity: .92,
        opacity: .95,
        dashArray: '3 2',
        className: 'known-place-marker',
      }).addTo(this.knownLayer);

      const source = safeExternalUrl(place.sourceUrl);
      marker.bindPopup([
        `<strong>${escapeHtml(place.name)}</strong>`,
        `<span>${escapeHtml(place.locality)} · known public gallery</span>`,
        '<span>current exhibition programme not yet ingested by hangabout</span>',
        `<small>${escapeHtml(place.sourceName)} · ${escapeHtml(place.precision)}-level location</small>`,
        source ? `<a href="${escapeHtml(source)}" target="_blank" rel="noopener">source directory ↗</a>` : '',
      ].filter(Boolean).join('<br>'));
    }
  }

  setDiscoveries(places: DiscoveredPlace[]): number {
    this.discoveryLayer.clearLayers();
    const rendered = places.filter(place => !this.matchesCanonicalNameOrPoint(place.name, place.point));
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

  private matchesCanonicalNameOrPoint(nameValue: string, point: Point): boolean {
    const name = normaliseName(nameValue);
    return this.canonicalVenues.some(venue =>
      normaliseName(venue.name) === name || haversine(venue.point, point) < 0.06
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
    const points = [
      ...dataset.venues.map(exactVenuePoint).filter((p): p is Point => Boolean(p)),
      ...dataset.knownPlaces.map(place => [place.lat, place.lng] as Point),
    ];
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
  private markerSignature = '';

  constructor(element: HTMLElement, private readonly onSuburb: (suburb: string) => void) {
    this.map = L.map(element, { scrollWheelZoom: false, zoomControl: true }).setView(MELBOURNE, 11);
    L.tileLayer(TILE_URL, {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(this.map);
    this.layer = L.layerGroup().addTo(this.map);
  }

  render(resources: MakeResource[], pathwayVenues: Venue[] = []) {
    this.layer.clearLayers();
    const groups = new Map<string, { suburb: string; point: Point; resources: MakeResource[]; pathways: Venue[] }>();
    for (const resource of resources) {
      const point = resourcePoint(resource);
      if (!point) continue;
      const key = resource.suburb.toLowerCase();
      const existing = groups.get(key);
      if (existing) existing.resources.push(resource);
      else groups.set(key, { suburb: resource.suburb, point, resources: [resource], pathways: [] });
    }
    for (const venue of pathwayVenues) {
      const point = exactVenuePoint(venue);
      if (!point) continue;
      const key = venue.suburb.toLowerCase();
      const existing = groups.get(key);
      if (existing) existing.pathways.push(venue);
      else groups.set(key, { suburb: venue.suburb, point, resources: [], pathways: [venue] });
    }

    const markers: Marker[] = [];
    for (const group of groups.values()) {
      const count = group.resources.length + group.pathways.length;
      const marker = L.marker(group.point, {
        icon: divIcon(String(count), 'resource-pin'),
        title: `${group.suburb}: ${count} resources`,
      }).addTo(this.layer);
      const resourceRows = group.resources.map(resource => {
        const source = safeExternalUrl(resource.website);
        return [
          '<li>',
          `<strong>${escapeHtml(resource.name)}</strong>`,
          `<small>${escapeHtml(resource.resourceType)}${resource.price ? ` · ${escapeHtml(resource.price)}` : ''}</small>`,
          '<span class="popup-links">',
          `<a href="#resource-${escapeHtml(resource.id)}">show in list ↓</a>`,
          source ? `<a href="${escapeHtml(source)}" target="_blank" rel="noopener">availability ↗</a>` : '',
          '</span>',
          '</li>',
        ].join('');
      });
      const pathwayRows = group.pathways.map(venue => [
        '<li>',
        `<strong>${escapeHtml(venue.name)}</strong>`,
        '<small>gallery / organisation pathway</small>',
        `<span class="popup-links"><a href="#pathway-${escapeHtml(venue.id)}">show in list ↓</a></span>`,
        '</li>',
      ].join(''));
      marker.bindPopup([
        `<strong>${escapeHtml(group.suburb)}</strong>`,
        `<span>${count} ${count === 1 ? 'resource' : 'resources'} in this view</span>`,
        `<ul class="popup-listings">${[...resourceRows, ...pathwayRows].join('')}</ul>`,
        `<button type="button" class="popup-filter">show only ${escapeHtml(group.suburb)} ↓</button>`,
      ].join('<br>'), { maxWidth: 350, minWidth: 260 });
      marker.on('popupopen', () => {
        marker.getPopup()?.getElement()?.querySelector<HTMLButtonElement>('.popup-filter')
          ?.addEventListener('click', () => this.onSuburb(group.suburb), { once: true });
      });
      markers.push(marker);
    }

    const signature = [...groups.entries()].map(([key, group]) =>
      `${key}:${group.resources.map(resource => resource.id).join(',')}:${group.pathways.map(venue => venue.id).join(',')}`
    ).sort().join('|');
    if (markers.length && signature !== this.markerSignature) {
      const bounds = L.featureGroup(markers).getBounds();
      if (bounds.isValid()) this.map.fitBounds(bounds.pad(.15), { maxZoom: 12 });
    }
    this.markerSignature = signature;
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
