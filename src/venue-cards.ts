import type { Event, Venue } from './types';

export interface VenueEventGroup {
  venue: Venue;
  events: Event[];
}

/**
 * Group an already-filtered and already-sorted exhibition stream by venue while
 * preserving the first-occurrence order of venues and the exhibition order
 * within each venue.
 */
export function groupEventsByVenue(
  events: Event[],
  venueById: ReadonlyMap<string, Venue>,
): VenueEventGroup[] {
  const groups = new Map<string, VenueEventGroup>();

  for (const event of events) {
    const venue = venueById.get(event.venueId);
    if (!venue) continue;
    const existing = groups.get(venue.id);
    if (existing) existing.events.push(event);
    else groups.set(venue.id, { venue, events: [event] });
  }

  return [...groups.values()];
}
