import venuesBase from '../../data/venues.json';
import venuesExtra from '../../data/venues-extra.json';
import venuesMajor from '../../data/venues-major.json';
import eventsBase from '../../data/events.json';
import eventsExtra from '../../data/events-extra.json';
import eventsMajor from '../../data/events-major.json';
import programmeEventsBase from '../../data/programme-events.json';
import resourcesBase from '../../data/make-resources.json';
import resourcesExtra from '../../data/make-resources-extra.json';
import coordinateOverlay from '../../data/venue-coordinates.json';
import knownPlacesBase from '../../data/known-art-places.json';
import studioVacanciesBase from '../../data/studio-vacancies.json';

import type {
  CoordinateOverlay,
  Dataset,
  Exhibition,
  KnownArtPlace,
  MakeResource,
  ProgrammeEvent,
  StudioPremise,
  StudioVacancy,
  Venue,
} from '../types';

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

  // The existing events*.json files are date-range shows. Keep their stable IDs and
  // project them into the explicit Exhibition model while the signed-off UI continues
  // to consume the legacy `events` alias.
  const exhibitions = mergeById(
    validated<Exhibition[]>(eventsBase),
    validated<Exhibition[]>(eventsExtra),
    validated<Exhibition[]>(eventsMajor),
  );

  // Timed programme items (openings, talks, performances, tours, etc.) now have an
  // independent canonical layer. It starts empty so introducing the model does not
  // alter the live product before source-backed records are reviewed.
  const programmeEvents = mergeById(
    validated<ProgrammeEvent[]>(programmeEventsBase),
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
      // A vacancy check is the authoritative freshness signal for the
      // listing projected onto this durable studio premise. Keep the
      // premise itself even when the listing is stale or a refresh fails.
      lastVerified: vacancy?.lastVerified ?? resource.lastVerified,
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
  const usableExhibitions = exhibitions.filter(exhibition => venueIds.has(exhibition.venueId));
  const usableProgrammeEvents = programmeEvents.filter(event => {
    if (!venueIds.has(event.venueId)) return false;
    if (!event.exhibitionId) return true;
    return usableExhibitions.some(exhibition => exhibition.id === event.exhibitionId);
  });

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
    exhibitions: usableExhibitions,
    programmeEvents: usableProgrammeEvents,
    // Compatibility surface: existing UI code can keep using dataset.events while the
    // v1 programme UI migrates deliberately rather than in one risky rewrite.
    events: usableExhibitions,
    resources,
    knownPlaces,
    studioPremises,
    studioVacancies,
  };
}
