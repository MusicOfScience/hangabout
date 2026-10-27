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
  countryCode?: string;
  stateCode?: string;
  locality?: string;
  postcode?: string;
  region?: string;
  timeZone?: string;
  coverageStatus?: 'maintained-programme' | 'known-place' | 'candidate' | 'outside-coverage' | string;
  coordinatePrecision?: 'exact' | 'building' | 'locality';
  coordinateSourceName?: string;
}

/**
 * Legacy embedded opening metadata retained while canonical openings migrate to
 * ProgrammeEvent records linked by exhibitionId.
 */
export interface OpeningEvent {
  date: string;
  start?: string;
  end?: string;
}

/** A date-range art presentation: exhibition, prize, graduate show, etc. */
export interface Exhibition {
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

/**
 * Backwards-compatible name used by the current UI. New code should use
 * Exhibition for date-range shows and ProgrammeEvent for timed programme items.
 */
export type Event = Exhibition;

export type ProgrammeEventType =
  | 'opening'
  | 'artist-talk'
  | 'performance'
  | 'tour'
  | 'workshop'
  | 'launch'
  | 'auction'
  | 'poetry'
  | 'screening'
  | 'other';

export type ProgrammePersonRole =
  | 'artist'
  | 'facilitator'
  | 'speaker'
  | 'curator'
  | 'guide'
  | 'performer'
  | 'host'
  | 'other';

/** A named participant in a timed programme item, with their source-supported role. */
export interface ProgrammePerson {
  name: string;
  role: ProgrammePersonRole | string;
}

/** Optional booking/registration facts; unknown values stay absent rather than inferred. */
export interface ProgrammeRegistration {
  required?: boolean;
  url?: string;
  status?: 'open' | 'fully-booked' | 'sold-out' | 'waitlist' | 'closed' | 'unknown' | string;
  capacityNote?: string;
}

/** A timed programme item, optionally linked to an exhibition. */
export interface ProgrammeEvent {
  id: string;
  venueId: string;
  exhibitionId?: string;
  title: string;
  eventType: ProgrammeEventType | string;
  startDate: string;
  startTime?: string;
  endDate?: string;
  endTime?: string;
  people?: ProgrammePerson[];
  tags?: string[];
  admission?: 'free' | 'paid' | 'unknown' | string;
  price?: string;
  registration?: ProgrammeRegistration;
  audienceNote?: string;
  materialsNote?: string;
  locationNote?: string;
  status?: 'scheduled' | 'cancelled' | 'postponed' | 'rescheduled' | string;
  sourceName: string;
  sourceType: 'official' | 'directory' | 'calendar';
  sourceUrl: string;
  lastVerified: string;
}

export type ProgrammeSourceKind = 'official' | 'directory' | 'calendar' | 'dataset' | 'manual';

/** A durable description of an input source; it is not itself evidence of an event. */
export interface ProgrammeSource {
  id: string;
  name: string;
  kind: ProgrammeSourceKind;
  url?: string;
  publisher?: string;
  notes?: string;
}

/**
 * Loss-minimising representation of one observation from an external source.
 * Normalisation and entity resolution may derive canonical records from this,
 * but should not overwrite the source observation.
 */
export interface SourceObservation {
  id: string;
  sourceId: string;
  externalId?: string;
  observedAt: string;
  titleRaw: string;
  startRaw?: string;
  endRaw?: string;
  locationRaw?: string;
  urlRaw?: string;
  calendarStatusRaw?: string;
  status?: 'observed' | 'matched' | 'unresolved' | 'rejected' | string;
  payloadHash?: string;
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
  /** Stable durable premise identity for studio records. */
  premisesId?: string;
  vacancyId?: string;
  studioType?: 'private' | 'shared' | 'cooperative' | 'workshop' | 'residency' | 'unknown' | string;
  practiceTypes?: string[];
  features?: Partial<Record<'private' | 'shared' | '24/7' | 'sink' | 'wash-up' | 'heating' | 'cooling' | 'ventilation' | 'natural-light' | 'secure' | 'storage' | 'accessible' | 'quiet', boolean>>;
  availabilityStatus?: 'advertised' | 'occupied' | 'waitlist' | 'unknown' | 'expired' | string;
  availableFrom?: string;
  priceAmount?: number;
  pricePeriod?: 'hour' | 'day' | 'week' | 'month' | 'year' | string;
  coordinatePrecision?: 'exact' | 'building' | 'locality';
  premisesStatus?: 'active' | 'uncertain' | 'retired' | string;
}

export interface StudioVacancy {
  id: string;
  premisesId: string;
  availabilityStatus: 'advertised' | 'occupied' | 'waitlist' | 'unknown' | 'expired' | string;
  availability?: string;
  availableFrom?: string;
  price?: string;
  priceAmount?: number;
  pricePeriod?: 'hour' | 'day' | 'week' | 'month' | 'year' | string;
  size?: string;
  sourceName: string;
  sourceType: 'official' | 'directory';
  sourceUrl: string;
  lastVerified: string;
  checkStatus?: 'ok' | 'failed' | 'blocked' | 'not-found' | string;
}

export interface StudioPremise {
  id: string;
  name: string;
  suburb: string;
  address: string;
  website: string;
  sourceName: string;
  sourceType: 'official' | 'directory';
  sourceUrl?: string;
  lastVerified: string;
  premisesStatus?: 'active' | 'uncertain' | 'retired' | string;
  studioType?: string;
  practiceTypes?: string[];
  features?: MakeResource['features'];
  coordinatePrecision?: 'exact' | 'building' | 'locality';
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
  /** Canonical date-range shows. */
  exhibitions: Exhibition[];
  /** Timed programme items such as openings, talks, workshops, performances and tours. */
  programmeEvents: ProgrammeEvent[];
  /** Legacy alias used by the current signed-off UI during migration. */
  events: Event[];
  resources: MakeResource[];
  knownPlaces: KnownArtPlace[];
  studioPremises: StudioPremise[];
  studioVacancies: StudioVacancy[];
}

export type Mode = 'see' | 'make';
export type QuickFilter = 'all' | 'current' | 'open' | 'today' | 'weekend' | 'openings' | 'closing' | 'free' | 'nearby' | 'saved';
export type SortMode = 'closing' | 'newest' | 'distance' | 'az';
