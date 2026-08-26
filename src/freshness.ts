import { todayMelbourne } from './time';
import type { MakeResource } from './types';

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

export function resourceFreshness(resource: MakeResource, today = todayMelbourne()): Freshness {
  const ageDays = Math.max(0, dayNumber(today) - dayNumber(resource.lastVerified));
  const reviewDays = REVIEW_DAYS[resource.resourceType] ?? 30;
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
