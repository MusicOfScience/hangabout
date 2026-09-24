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
import studioVacanciesBase from '../../data/studio-vacancies.json';

import type { CoordinateOverlay, Dataset, Event, KnownArtPlace, MakeResource, StudioPremise, StudioVacancy, Venue } from '../types';

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

  const rawResources = mergeById(
    validated<MakeResource[]>(resourcesBase),
    validated<MakeResource[]>(resourcesExtra),
  );

  const studioVacancies = validated<StudioVacancy[]>(studioVacanciesBase);
  const vacancyByPremise = new Map<string, StudioVacancy>();
  for (const vacancy of studioVacancies) {
    const current = vacancyByPremise.get(vacancy.premisesId);
    if (!current || vacancy.lastVerified > current.lastVerified) vacancyByPremise.set(vacancy.premisesId, vacancy);
  }

  // A studio premise is durable; a vacancy is an independently refreshed listing.
  // Project the latest known vacancy onto the existing resource shape so the signed-off
  // cards and deep links remain stable while callers can use the structured fields.
  const resources = rawResources.map(resource => {
    if (resource.resourceType !== 'studio') return resource;
    const vacancy = vacancyByPremise.get(resource.id);
    const features = Object.fromEntries([
      ['24/7', resource.tags?.includes('24/7')],
      ['wash-up', resource.tags?.includes('wash-up')],
      ['sink', resource.tags?.includes('wash-up')],
      ['natural-light', resource.tags?.includes('natural-light')],
      ['accessible', resource.tags?.includes('accessible')],
    ].filter(([, value]) => value)) as MakeResource['features'];
    return {
      ...resource,
      premisesId: resource.id,
      vacancyId: vacancy?.id,
      availability: vacancy?.availability ?? resource.availability,
      price: vacancy?.price ?? resource.price,
      size: vacancy?.size ?? resource.size,
      availabilityStatus: vacancy?.availabilityStatus ?? 'unknown',
      availableFrom: vacancy?.availableFrom,
      priceAmount: vacancy?.priceAmount,
      pricePeriod: vacancy?.pricePeriod,
      premisesStatus: 'active',
      coordinatePrecision: resource.coordinatePrecision ?? (resource.lat != null && resource.lng != null ? 'building' : 'locality'),
      practiceTypes: resource.tags?.filter(tag => !['available-now', '24/7', 'wash-up', 'natural-light', 'accessible'].includes(tag)),
      features,
    } satisfies MakeResource;
  });

  const knownPlaces = mergeById(
    validated<KnownArtPlace[]>(knownPlacesBase),
  );

  const venueIds = new Set(canonicalVenues.map(v => v.id));
  const usableEvents = events.filter(event => venueIds.has(event.venueId));
  const studioPremises: StudioPremise[] = resources
    .filter(resource => resource.resourceType === 'studio')
    .map(resource => ({
      id: resource.premisesId ?? resource.id,
      name: resource.name,
      suburb: resource.suburb,
      address: resource.address,
      website: resource.website,
      sourceName: resource.sourceName,
      sourceType: resource.sourceType,
      lastVerified: resource.lastVerified,
      premisesStatus: resource.premisesStatus ?? 'active',
      studioType: resource.studioType ?? 'unknown',
      practiceTypes: resource.practiceTypes,
      features: resource.features,
      coordinatePrecision: resource.coordinatePrecision,
      lat: resource.lat,
      lng: resource.lng,
    }));

  return {
    venues: canonicalVenues,
    events: usableEvents,
    resources,
    knownPlaces,
    studioPremises,
    studioVacancies,
  };
}
