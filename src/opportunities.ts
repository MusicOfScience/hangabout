import catalogue from '@opportunity-catalogue';
import { todayInTimeZone } from './time';

export const categories = {
  'artist-grant': 'Artist grants',
  fellowship: 'Fellowships',
  'scholarship-bursary': 'Scholarships and bursaries',
  residency: 'Artist residencies',
  'professional-development': 'Professional development',
  'mentorship-masterclass': 'Mentorships and masterclasses',
  'materials-equipment': 'Materials and equipment funding',
  'studio-workspace': 'Studio and workspace funding',
  commission: 'Commissions',
  'exhibition-opportunity': 'Exhibition opportunities',
  'prize-award': 'Artist prizes and awards',
  'cultural-exchange': 'International cultural exchange',
  'travel-mobility': 'Travel and mobility funding',
  'research-experimental': 'Research and experimental practice funding',
  'emergency-assistance': 'Emergency assistance',
  'disability-specific': 'Accessible and disability-specific funding',
} as const;

export const verificationLabels = {
  verified: 'Verified with funder',
  'partially-verified': 'Partially verified',
  'discovery-only': 'Discovery only',
  stale: 'Verification overdue',
  quarantined: 'Quarantined',
} as const;

export const lifecycleLabels = {
  forthcoming: 'Forthcoming',
  open: 'Open',
  'closing-soon': 'Closing soon',
  closed: 'Closed',
  suspended: 'Suspended or cancelled',
  unknown: 'Status unknown',
} as const;

export const fundingLabels = {
  direct: 'Direct financial support',
  'in-kind': 'In-kind support',
  partial: 'Partially funded',
  unfunded: 'Unfunded',
  'participant-expenditure': 'Participant expenditure required',
  unknown: 'Funding type not published',
} as const;

export const states = {
  ACT: 'Australian Capital Territory', NSW: 'New South Wales', NT: 'Northern Territory',
  QLD: 'Queensland', SA: 'South Australia', TAS: 'Tasmania', VIC: 'Victoria', WA: 'Western Australia',
};

type Verification = keyof typeof verificationLabels;
type Lifecycle = keyof typeof lifecycleLabels;
type Fee = { amount: number; currency: string };
type UnknownText = string | null;

export interface Opportunity {
  id: string;
  title: string;
  organisation: string;
  summary: string;
  categories: (keyof typeof categories)[];
  officialUrl: string;
  applicationUrl: UnknownText;
  verificationStatus: Verification;
  lastVerifiedAt: string;
  staleAfterDays: number;
  funding: {
    minimum: number | null;
    maximum: number | null;
    currency: UnknownText;
    type: keyof typeof fundingLabels;
    fullyFunded: boolean | null;
    applicationFee: Fee | null;
    participationFee: Fee | null;
    coContribution: UnknownText;
    travel: UnknownText;
    accommodation: UnknownText;
    materials: UnknownText;
    otherCosts: UnknownText;
    conditions: UnknownText;
  };
  eligibility: {
    scope: 'national' | 'state' | 'municipality' | 'international' | 'unknown';
    geographicConfidence: 'confirmed' | 'potential' | 'unknown';
    geography: UnknownText;
    countries: string[] | null;
    states: string[] | null;
    municipalities: string[] | null;
    disciplines: string[] | null;
    careerStages: string[] | null;
    applicantTypes: string[] | null;
    criteria: UnknownText;
    citizenship: UnknownText;
    residency: UnknownText;
    age: UnknownText;
    qualifications: UnknownText;
    specialistCriteria: UnknownText;
    accessibility: UnknownText;
    disabilitySpecific: boolean | null;
  };
  timing: {
    observedStatus: Lifecycle;
    openingDate: UnknownText;
    opensAt: UnknownText;
    closingDate: UnknownText;
    closesAt: UnknownText;
    deadlineTimezone: UnknownText;
    commencementDate: UnknownText;
    duration: UnknownText;
    recurrence: UnknownText;
    rolling: boolean;
  };
  applicationRequirements: UnknownText;
  selectionCriteria: UnknownText;
  restrictions: UnknownText;
  uncertainties: UnknownText;
}

// The offline Python validation gate checks the data contract before builds and publication.
export const opportunities = catalogue.opportunities as Opportunity[];
const day = 86_400_000;

export function verificationOf(record: Opportunity, now: Date): Verification {
  if (!['verified', 'partially-verified'].includes(record.verificationStatus)) return record.verificationStatus;
  return now.getTime() - Date.parse(record.lastVerifiedAt) >= record.staleAfterDays * day
    ? 'stale' : record.verificationStatus;
}

export function lifecycleOf(record: Opportunity, now: Date): Lifecycle {
  const timing = record.timing;
  if (timing.observedStatus === 'suspended') return 'suspended';
  if (timing.observedStatus === 'closed') return 'closed';
  const deadline = timing.closesAt ? Date.parse(timing.closesAt) : null;
  const today = timing.deadlineTimezone ? todayInTimeZone(timing.deadlineTimezone, now) : null;
  if (deadline !== null && now.getTime() >= deadline) return 'closed';
  if (deadline === null && today && timing.closingDate && today > timing.closingDate) return 'closed';
  const verification = verificationOf(record, now);
  if (verification === 'stale' || verification === 'quarantined' || verification === 'discovery-only') return 'unknown';
  if (timing.opensAt && now.getTime() < Date.parse(timing.opensAt)) return 'forthcoming';
  if (timing.openingDate && today && today < timing.openingDate) return 'forthcoming';
  if (timing.observedStatus === 'forthcoming') {
    // The published opening date can pass before a fresh check confirms intake.
    const openingReached = timing.opensAt ? now.getTime() >= Date.parse(timing.opensAt)
      : timing.openingDate && today && today >= timing.openingDate;
    return openingReached ? 'unknown' : 'forthcoming';
  }
  if (!['open', 'closing-soon'].includes(timing.observedStatus) || verification !== 'verified') return 'unknown';
  if (deadline === null && timing.closingDate && (!today || today === timing.closingDate)) return 'unknown';
  if (deadline !== null && deadline - now.getTime() <= 7 * day) return 'closing-soon';
  if (deadline === null && timing.closingDate && today
      && Date.parse(timing.closingDate) - Date.parse(today) <= 7 * day) return 'closing-soon';
  return 'open';
}

export const unknown = 'Not published';

export function plainDate(value: string): string {
  return new Intl.DateTimeFormat('en-AU', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(value));
}

export function deadlineLabel(record: Opportunity): string {
  const { closesAt, closingDate, deadlineTimezone, rolling } = record.timing;
  if (closesAt && deadlineTimezone) {
    return new Intl.DateTimeFormat('en-AU', {
      day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit',
      timeZone: deadlineTimezone, timeZoneName: 'short',
    }).format(new Date(closesAt));
  }
  if (closingDate) return `${plainDate(closingDate)} · time not published`;
  return rolling ? 'Rolling applications' : unknown;
}

export function money(amount: number, currency: string): string {
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency, currencyDisplay: 'code',
    minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(amount);
}

export function fundingLabel({ minimum, maximum, currency }: Opportunity['funding']): string {
  if (!currency) return unknown;
  if (minimum !== null && maximum !== null && minimum !== maximum) {
    return `${money(minimum, currency)}–${money(maximum, currency)}`;
  }
  if (minimum !== null) return maximum === minimum ? money(minimum, currency) : `From ${money(minimum, currency)}`;
  return maximum !== null ? `Up to ${money(maximum, currency)}` : unknown;
}

export function feeLabel(fee: Fee | null): string {
  return fee ? (fee.amount === 0 ? 'Free' : money(fee.amount, fee.currency)) : unknown;
}

export interface OpportunityFilters {
  status: string;
  region: string;
  municipality: string;
  category: string;
  discipline: string;
  career: string;
  fundingAmount: number;
  fundingCurrency: string;
  deadline: string;
  free: boolean;
  fullyFunded: boolean;
  accessible: boolean;
  verification: string;
  geoConfidence: string;
  query: string;
}

export function matchesOpportunity(record: Opportunity, filters: OpportunityFilters, now: Date): boolean {
  const eligibility = record.eligibility;
  const funding = record.funding;
  const status = lifecycleOf(record, now);
  if (filters.status === 'active' && !['open', 'closing-soon', 'forthcoming'].includes(status)) return false;
  if (filters.status === 'open' && !['open', 'closing-soon'].includes(status)) return false;
  if (!['active', 'open', 'all'].includes(filters.status) && status !== filters.status) return false;
  if (filters.region === 'national' && eligibility.scope !== 'national') return false;
  if (filters.region === 'international' && eligibility.scope !== 'international') return false;
  if (filters.region && Object.hasOwn(states, filters.region)
      && (eligibility.scope === 'international'
        || (eligibility.scope !== 'national' && !eligibility.states?.includes(filters.region)))) return false;
  if (filters.municipality && !eligibility.municipalities?.includes(filters.municipality)) return false;
  if (filters.category && !record.categories.some(category => category === filters.category)) return false;
  if (filters.discipline && !eligibility.disciplines?.some(discipline => discipline === 'all' || discipline === filters.discipline)) return false;
  if (filters.career && !eligibility.careerStages?.includes(filters.career)) return false;
  if (filters.fundingAmount > 0 && (funding.currency !== filters.fundingCurrency
    || (funding.maximum ?? funding.minimum ?? -1) < filters.fundingAmount)) return false;
  if (filters.deadline && (!record.timing.closingDate || record.timing.closingDate > filters.deadline)) return false;
  if (filters.free && funding.applicationFee?.amount !== 0) return false;
  if (filters.fullyFunded && funding.fullyFunded !== true) return false;
  if (filters.accessible && !eligibility.accessibility && eligibility.disabilitySpecific !== true
      && !record.categories.includes('disability-specific')) return false;
  if (filters.verification && verificationOf(record, now) !== filters.verification) return false;
  if (filters.geoConfidence && eligibility.geographicConfidence !== filters.geoConfidence) return false;
  const searchable = [record.title, record.organisation, record.summary, eligibility.geography,
    ...record.categories.map(category => categories[category]), ...(eligibility.disciplines ?? [])].join(' ').toLowerCase();
  return filters.query.toLowerCase().trim().split(/\s+/).every(word => searchable.includes(word));
}

export function rankOpportunities(records: Opportunity[], now: Date, sort: string): Opportunity[] {
  const order: Record<Lifecycle, number> = {
    'closing-soon': 0, open: 1, forthcoming: 2, unknown: 3, suspended: 4, closed: 5,
  };
  const opening = (record: Opportunity) => Date.parse(record.timing.openingDate ?? '') || 0;
  const deadline = (record: Opportunity) => {
    const value = record.timing.closesAt ?? record.timing.closingDate;
    return value ? Date.parse(value) : Number.MAX_SAFE_INTEGER;
  };
  const audFunding = (record: Opportunity) => record.funding.currency === 'AUD'
    ? (record.funding.maximum ?? record.funding.minimum ?? -1) : -1;
  return [...records].sort((a, b) => {
    if (sort === 'deadline') return deadline(a) - deadline(b) || a.title.localeCompare(b.title);
    if (sort === 'funding') return audFunding(b) - audFunding(a) || a.title.localeCompare(b.title);
    if (sort === 'recent') return opening(b) - opening(a) || a.title.localeCompare(b.title);
    return order[lifecycleOf(a, now)] - order[lifecycleOf(b, now)]
      || (lifecycleOf(a, now) === 'open' ? opening(b) - opening(a) : 0)
      || deadline(a) - deadline(b) || a.title.localeCompare(b.title);
  });
}
