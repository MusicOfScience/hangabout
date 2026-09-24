import type { MakeResource } from './types';
import { resourceFreshness } from './freshness';

const STOP_WORDS = new Set(['a', 'an', 'and', 'for', 'in', 'of', 'the', 'to', 'with']);

function normalise(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9$]+/g, ' ').trim();
}

function tokens(value: string): string[] {
  return normalise(value).split(/\s+/).filter(token => token && !STOP_WORDS.has(token));
}

function searchableText(resource: MakeResource): string {
  return normalise([
    resource.name,
    resource.suburb,
    resource.summary,
    resource.availability,
    resource.tags?.join(' ') ?? '',
    resource.practiceTypes?.join(' ') ?? '',
    Object.entries(resource.features ?? {}).filter(([, value]) => value).map(([key]) => key).join(' '),
  ].join(' '));
}

function priceLimit(query: string): { amount: number; period?: string } | null {
  const match = query.match(/(?:under|below|less than)\s*(?:a\$|\$)?\s*([\d,]+)\s*(hour|day|week|month|year)?/i);
  if (!match) return null;
  return { amount: Number(match[1]!.replaceAll(',', '')), period: match[2]?.toLowerCase() };
}

function monthlyAmount(resource: MakeResource): number {
  if (resource.priceAmount == null) return Number.POSITIVE_INFINITY;
  if (resource.pricePeriod === 'week') return resource.priceAmount * 52 / 12;
  if (resource.pricePeriod === 'year') return resource.priceAmount / 12;
  if (resource.pricePeriod === 'month') return resource.priceAmount;
  return Number.POSITIVE_INFINITY;
}

function matchesPrice(resource: MakeResource, limit: { amount: number; period?: string }): boolean {
  if (resource.priceAmount == null) return false;
  if (!limit.period || limit.period === resource.pricePeriod) return resource.priceAmount < limit.amount;
  if (limit.period === 'month') return monthlyAmount(resource) < limit.amount;
  return false;
}

/** Structured, deterministic Make Art query matching. Unknown fields never match a positive claim. */
export function matchesStudioQuery(resource: MakeResource, query: string): boolean {
  const clean = normalise(query);
  if (!clean) return true;
  const limit = priceLimit(clean);
  if (limit && !matchesPrice(resource, limit)) return false;
  const withoutPrice = clean.replace(/(?:under|below|less than)\s*(?:a\$|\$)?\s*[\d,]+\s*(?:hour|day|week|month|year)?/gi, ' ');
  const text = searchableText(resource);
  return tokens(withoutPrice).every(token => {
    if (token === 'sink') return resource.features?.sink === true || resource.features?.['wash-up'] === true;
    if (token === 'washup') return resource.features?.['wash-up'] === true;
    if (token === 'accessible') return resource.features?.accessible === true;
    if (token === 'quiet') return resource.features?.quiet === true;
    if (token === '24' || token === '7') return resource.features?.['24/7'] === true;
    return text.includes(token);
  });
}

/** Stable relevance score used only after explicit filtering. */
export function studioRelevance(resource: MakeResource, query: string): number {
  const queryTokens = tokens(query);
  const text = searchableText(resource);
  const exactMatches = queryTokens.filter(token => text.includes(token)).length;
  const freshness = resourceFreshness(resource).state === 'current' ? 2 : resourceFreshness(resource).state === 'recheck' ? 1 : 0;
  const sourceConfidence = resource.sourceType === 'official' ? 1 : 0;
  const completeness = [resource.priceAmount, resource.size, resource.features, resource.practiceTypes].filter(Boolean).length;
  return exactMatches * 10 + freshness * 3 + sourceConfidence + completeness * 0.1;
}

export function studioMonthlyAmount(resource: MakeResource): number {
  return monthlyAmount(resource);
}
