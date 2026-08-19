import venuesBase from '../../data/venues.json';
import venuesExtra from '../../data/venues-extra.json';
import venuesMajor from '../../data/venues-major.json';
import eventsBase from '../../data/events.json';
import eventsExtra from '../../data/events-extra.json';
import eventsMajor from '../../data/events-major.json';
import resourcesBase from '../../data/make-resources.json';
import resourcesExtra from '../../data/make-resources-extra.json';
import coordinateOverlay from '../../data/venue-coordinates.json';
import knownPlacesBase from '../../data/known-art-places.json';

import type { CoordinateOverlay, Dataset, Event, KnownArtPlace, MakeResource, Venue } from '../types';

function mergeById<T extends { id: string }>(...layers: T[][]): T[] {
  const byId = new Map<string, T>();
  for (const layer of layers) {
    for (const item of layer) byId.set(item.id, item);
  }
  return [...byId.values()];
}

function validated<T>(value: unknown): T {
  // Repository Python validators gate canonical JSON before build/deploy.
  // This is the single boundary where validated/static data enters the typed UI.
  return value as T;
}

export function loadDataset(): Dataset {
  const venues = mergeById(
    validated<Venue[]>(venuesBase),
    validated<Venue[]>(venuesExtra),
    validated<Venue[]>(venuesMajor),
  );

  const overlays = new Map(
    validated<CoordinateOverlay[]>(coordinateOverlay).map(item => [item.venueId, item]),
  );

  const canonicalVenues = venues.map(venue => {
    const overlay = overlays.get(venue.id);
    if (!overlay) return venue;
    return {
      ...venue,
      lat: overlay.lat,
      lng: overlay.lng,
      coordinatePrecision: overlay.precision,
      coordinateSourceName: overlay.sourceName,
    } satisfies Venue;
  });

  const events = mergeById(
    validated<Event[]>(eventsBase),
    validated<Event[]>(eventsExtra),
    validated<Event[]>(eventsMajor),
  );

  const resources = mergeById(
    validated<MakeResource[]>(resourcesBase),
    validated<MakeResource[]>(resourcesExtra),
  );

  const knownPlaces = mergeById(
    validated<KnownArtPlace[]>(knownPlacesBase),
  );

  const venueIds = new Set(canonicalVenues.map(v => v.id));
  const usableEvents = events.filter(event => venueIds.has(event.venueId));

  return {
    venues: canonicalVenues,
    events: usableEvents,
    resources,
    knownPlaces,
  };
}
