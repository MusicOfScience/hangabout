export type VenueKind =
  | 'major-institution'
  | 'municipal'
  | 'contemporary-org'
  | 'artist-run'
  | 'independent'
  | 'commercial'
  | 'university'
  | 'first-nations-led'
  | 'specialist';

export type Hours = Record<string, [number, number]>;

export interface Venue {
  id: string;
  name: string;
  kind: VenueKind | string;
  suburb: string;
  address: string;
  lat?: number;
  lng?: number;
  website: string;
  hours?: Hours;
  hoursVerified?: boolean;
  hoursSourceUrl?: string;
  hoursNote?: string;
  focus?: string[];
  artistPathways?: Array<{ label: string; url: string }>;
  access?: { level?: string; note?: string; sourceUrl?: string };
  sourceUrl?: string;
  lastVerified?: string;
  coordinatePrecision?: 'exact' | 'building';
  coordinateSourceName?: string;
}

export interface OpeningEvent {
  date: string;
  start?: string;
  end?: string;
}

export interface Event {
  id: string;
  venueId: string;
  title: string;
  artists: string[];
  startDate: string;
  endDate: string;
  eventType?: string;
  tags?: string[];
  admission?: 'free' | 'paid' | 'unknown' | string;
  opening?: OpeningEvent;
  sourceName: string;
  sourceType: 'official' | 'directory';
  sourceUrl: string;
  lastVerified: string;
}

export interface MakeResource {
  id: string;
  name: string;
  resourceType: 'studio' | 'workspace' | 'finder' | 'opportunity' | string;
  suburb: string;
  address: string;
  summary: string;
  price?: string;
  size?: string;
  availability?: string;
  tags?: string[];
  website: string;
  sourceName: string;
  sourceType: 'official' | 'directory';
  lastVerified: string;
  lat?: number;
  lng?: number;
}

export interface CoordinateOverlay {
  venueId: string;
  lat: number;
  lng: number;
  precision: 'exact' | 'building';
  method: string;
  sourceName: string;
  sourceUrl: string;
  lastVerified: string;
}

export interface KnownArtPlace {
  id: string;
  name: string;
  locality: string;
  lat: number;
  lng: number;
  placeType: string;
  precision: 'locality' | 'exact' | 'building';
  sourceName: string;
  sourceUrl: string;
  lastVerified: string;
}

export interface Dataset {
  venues: Venue[];
  events: Event[];
  resources: MakeResource[];
  knownPlaces: KnownArtPlace[];
}

export type Mode = 'see' | 'make';
export type QuickFilter = 'all' | 'open' | 'today' | 'weekend' | 'openings' | 'closing' | 'free' | 'nearby' | 'saved';
export type SortMode = 'closing' | 'newest' | 'distance' | 'az';
