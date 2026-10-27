import { todayMelbourne } from './time';
import type { Event, MakeResource, ProgrammeEvent, Venue } from './types';

export type FreshnessState = 'current' | 'recheck' | 'stale';

export interface Freshness {
  ageDays: number;
  state: FreshnessState;
  relativeLabel: string;
}

const REVIEW_DAYS: Record<string, number> = {
  studio: 7,
  opportunity: 7,
  workspace: 30,
  finder: 30,
};

function dayNumber(iso: string): number {
  const [year, month, day] = iso.split('-').map(Number);
  return Math.floor(Date.UTC(year!, month! - 1, day!) / 86_400_000);
}

function freshnessFor(
  record: { lastVerified: string },
  reviewDays: number,
  today: string,
): Freshness {
  const ageDays = Math.max(0, dayNumber(today) - dayNumber(record.lastVerified));
  const state: FreshnessState = ageDays <= reviewDays
    ? 'current'
    : ageDays <= reviewDays * 2
      ? 'recheck'
      : 'stale';

  const relativeLabel = ageDays === 0
    ? 'today'
    : ageDays === 1
      ? 'yesterday'
      : `${ageDays} days ago`;

  return { ageDays, state, relativeLabel };
}

export function resourceFreshness(resource: Pick<MakeResource, 'resourceType' | 'lastVerified'>, today = todayMelbourne()): Freshness {
  return freshnessFor(resource, REVIEW_DAYS[resource.resourceType] ?? 30, today);
}

export function eventFreshness(event: Event, today = todayMelbourne()): Freshness {
  return freshnessFor(event, 14, today);
}

export function programmeEventFreshness(event: Pick<ProgrammeEvent, 'lastVerified'>, today = todayMelbourne()): Freshness {
  return freshnessFor(event, 14, today);
}

export function programmeEventIsFresh(event: Pick<ProgrammeEvent, 'lastVerified'>, today = todayMelbourne()): boolean {
  // Timed details such as booking status and start time are volatile enough that a
  // recheck-due record should leave the live programme at the review deadline, not
  // linger for the second grace window used by date-range exhibitions.
  return programmeEventFreshness(event, today).state === 'current';
}

export function venueHoursAreFresh(
  venue: Pick<Venue, 'hoursVerified' | 'lastVerified'>,
  today = todayMelbourne(),
): boolean {
  if (!venue.hoursVerified || !venue.lastVerified) return false;
  // "Open now" is a live claim. Once the 90-day review deadline passes, degrade to
  // unverified rather than continuing to answer from old hours during a grace period.
  return freshnessFor({ lastVerified: venue.lastVerified }, 90, today).state === 'current';
}

export function hasCurrentAvailability(resource: MakeResource, today = todayMelbourne()): boolean {
  // A historic vacancy is still useful context, but cannot answer "available now".
  return resourceFreshness(resource, today).state !== 'stale'
    && /^available now\b/i.test(resource.availability?.trim() ?? '');
}
