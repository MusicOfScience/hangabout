import type { Mode, QuickFilter, SortMode } from './types';
import type { Point } from './geo';
import { readIds } from './storage';

export interface AppState {
  mode: Mode;
  query: string;
  quick: QuickFilter;
  venueKind: string;
  sort: SortMode;
  userLocation: Point | null;
  areaBounds: { north: number; south: number; east: number; west: number } | null;
  saved: Set<string>;
  crawl: Set<string>;
  makeQuery: string;
  makeKind: string;
  makeSuburb: string | null;
}

export const state: AppState = {
  mode: 'see',
  query: '',
  quick: 'all',
  venueKind: 'all',
  sort: 'closing',
  userLocation: null,
  areaBounds: null,
  saved: readIds('hangabout.saved'),
  crawl: readIds('hangabout.crawl'),
  makeQuery: '',
  makeKind: 'resources',
  makeSuburb: null,
};
