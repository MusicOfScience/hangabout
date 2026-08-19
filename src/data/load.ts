import venuesBase from '../../data/venues.json';
import venuesExtra from '../../data/venues-extra.json';
import venuesMajor from '../../data/venues-major.json';
import eventsBase from '../../data/events.json';
import eventsExtra from '../../data/events-extra.json';
import eventsMajor from '../../data/events-major.json';
import resourcesBase from '../../data/make-resources.json';
import resourcesExtra from '../../data/make-resources-extra.json';
import coordinateOverlay from '../../data/venue-coordinates.json';

import type { CoordinateOverlay, Dataset, Event, MakeResource, Venue } from '../types';

function mergeById<T extends { id: string }>(...layers: T[][]): T[] {
  const byId = new Map<string, T>();
  for (const layer of layers) {
    for (const item of layer) byId.set(item.id, item);
  }
  return [...byId.values()];
}

export function loadDataset(): Dataset {
  const venues = mergeById(
    venuesBase as Venue[],
    venuesExtra as Venue[],
    venuesMajor as Venue[],
  );

  const overlays = new Map(
    (coordinateOverlay as CoordinateOverlay[]).map(item => [item.venueId, item]),
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
    eventsBase as Event[],
    eventsExtra as Event[],
    eventsMajor as Event[],
  );

  const resources = mergeById(
    resourcesBase as MakeResource[],
    resourcesExtra as MakeResource[],
  );

  const venueIds = new Set(canonicalVenues.map(v => v.id));
  const usableEvents = events.filter(event => venueIds.has(event.venueId));

  return {
    venues: canonicalVenues,
    events: usableEvents,
    resources,
  };
}
