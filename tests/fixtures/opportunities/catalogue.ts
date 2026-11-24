import type { Opportunity } from '../../../src/opportunities';

const checked = '2026-11-24T13:37:00Z';
const base: Omit<Opportunity, 'id' | 'title' | 'organisation' | 'officialUrl'> = {
  summary: 'A grant for artistic practice.',
  categories: ['artist-grant'],
  applicationUrl: null,
  verificationStatus: 'verified',
  lastVerifiedAt: checked,
  staleAfterDays: 14,
  funding: {
    minimum: null, maximum: null, currency: null, type: 'unknown',
    fullyFunded: null, applicationFee: null, participationFee: null, coContribution: null,
    travel: null, accommodation: null, materials: null, otherCosts: null, conditions: null,
  },
  eligibility: {
    scope: 'unknown', geography: null, geographicConfidence: 'unknown', countries: null, states: null,
    municipalities: null, disciplines: null, careerStages: null, applicantTypes: null, criteria: null,
    citizenship: null, residency: null, age: null, qualifications: null, specialistCriteria: null,
    accessibility: null, disabilitySpecific: null,
  },
  timing: {
    observedStatus: 'unknown', openingDate: null, opensAt: null, closingDate: null,
    closesAt: null, deadlineTimezone: null, commencementDate: null, duration: null, recurrence: null, rolling: false,
  },
  applicationRequirements: null, selectionCriteria: null, restrictions: null, uncertainties: null,
};

const melbourne = 'Australia/Melbourne';

const potter: Opportunity = {
  ...base,
  id: 'ian-potter-cultural-trust-2027-round-1',
  title: 'Emerging Artist Grants · Round 1, 2027',
  organisation: 'The Ian Potter Cultural Trust',
  officialUrl: 'https://www.ianpotterculturaltrust.org.au/opportunities/emerging-artist-grants/how-to-apply/',
  applicationUrl: 'https://ipct.givingdata.com/portal/campaign/IPCT2027Round1Application',
  funding: { ...base.funding, maximum: 15000, currency: 'AUD', type: 'partial',
    coContribution: 'A reasonable personal contribution is required.' },
  eligibility: { ...base.eligibility, scope: 'national', geography: 'Australia-wide',
    geographicConfidence: 'confirmed', qualifications: 'Formal arts qualifications are optional.' },
  timing: { ...base.timing, observedStatus: 'open', openingDate: '2026-11-24', closingDate: '2027-01-19',
    closesAt: '2027-01-19T17:00:00+11:00', deadlineTimezone: melbourne },
};

const pkf: Opportunity = {
  ...base,
  id: 'pollock-krasner-rolling',
  title: 'Pollock-Krasner Foundation Grant',
  organisation: 'Pollock-Krasner Foundation',
  officialUrl: 'https://www.pkf.org/how-to-apply/',
  applicationUrl: 'https://bbgm-apply.yourcausegrants.com/apply/programs/afa38443-4f9b-41de-9d80-b14f36899241',
  staleAfterDays: 35,
  funding: { ...base.funding, maximum: 50000, currency: 'USD', type: 'direct' },
  eligibility: { ...base.eligibility, scope: 'international', geography: 'Worldwide',
    geographicConfidence: 'confirmed', disciplines: ['painting', 'printmaking'], careerStages: ['established'] },
  timing: { ...base.timing, observedStatus: 'open', rolling: true },
};

const wyndham: Opportunity[] = [
  { key: 'creative-development', title: 'Creative Development', cap: 3000, confidence: 'confirmed' },
  { key: 'skills-development', title: 'Skills Development', cap: 3000, confidence: 'confirmed' },
  { key: 'presentation', title: 'Presentation', cap: 5000, confidence: 'potential' },
].map(({ key, title, cap, confidence }) => ({
  ...base,
  id: `wyndham-2027-${key}`,
  title: `Wyndham Arts Grants · ${title} 2027`,
  organisation: 'Wyndham City Council',
  officialUrl: 'https://www.wyndham.vic.gov.au/services/arts-culture/residencies-commissions-grants/2027-wyndham-arts-grants',
  applicationUrl: 'https://wyndham.smartygrants.com.au/wyndhamartsgrants2027',
  funding: { ...base.funding, maximum: cap, currency: 'AUD', type: 'direct' },
  eligibility: { ...base.eligibility, scope: 'municipality', geography: 'Wyndham, Victoria',
    geographicConfidence: confidence as 'confirmed' | 'potential', states: ['VIC'], municipalities: ['Wyndham'] },
  timing: { ...base.timing, observedStatus: 'open', openingDate: '2026-10-28', closingDate: '2026-11-27',
    closesAt: '2026-11-27T15:00:00+11:00', deadlineTimezone: melbourne },
}));

const creativeAustralia: Opportunity = {
  ...base,
  id: 'creative-australia-2027-03',
  title: 'Arts Projects for Individuals and Groups · March 2027',
  organisation: 'Creative Australia',
  officialUrl: 'https://creative.gov.au/investments-opportunities/arts-projects-individuals-and-groups',
  verificationStatus: 'partially-verified',
  timing: { ...base.timing, observedStatus: 'forthcoming', closingDate: '2027-03-02',
    closesAt: '2027-03-02T15:00:00+11:00', deadlineTimezone: melbourne },
};

const archive: Opportunity = {
  ...creativeAustralia,
  id: 'creative-australia-2026-09',
  title: 'Arts Projects for Individuals and Groups · September 2026',
  verificationStatus: 'verified',
  timing: { ...base.timing, observedStatus: 'closed', closingDate: '2026-09-01',
    closesAt: '2026-09-01T15:00:00+10:00', deadlineTimezone: melbourne },
};

const ramsay: Opportunity = {
  ...base,
  id: 'agsa-ramsay-2027',
  title: 'Ramsay Art Prize 2027',
  organisation: 'Art Gallery of South Australia',
  officialUrl: 'https://www.agsa.sa.gov.au/whats-on/ramsay-art-prize/',
  supportingEvidenceUrl: 'https://www.agsa.sa.gov.au/whats-on/ramsay-art-prize/ramsay-art-prize-2027-terms-and-conditions/',
  applicationUrl: 'https://forms.sa.gov.au/form/6940cd41ec2338329cb7be0e',
  categories: ['prize-award'],
  funding: { ...base.funding, minimum: 100000, maximum: 100000, currency: 'AUD', type: 'direct',
    applicationFee: { amount: 50, currency: 'AUD' }, conditions: 'The gallery acquires the winning work.',
    otherCosts: 'The winner must obtain independent legal advice at their own expense.' },
  eligibility: { ...base.eligibility, scope: 'national', geography: 'Australia-wide', geographicConfidence: 'confirmed' },
  timing: { ...base.timing, observedStatus: 'open', openingDate: '2026-09-11', closingDate: '2026-12-11',
    opensAt: '2026-09-11T10:00:00+09:30', closesAt: '2026-12-11T17:00:00+10:30', deadlineTimezone: 'Australia/Adelaide' },
};

const createability: Opportunity = {
  ...base,
  id: 'create-nsw-createability-2026-27',
  title: 'Createability Internship · 2026-27',
  organisation: 'Create NSW (NSW Government)',
  officialUrl: 'https://www.nsw.gov.au/grants-and-funding/2026-27-createability-internship',
  applicationUrl: 'https://artsnsw.smartygrants.com.au/2026-27CI',
  categories: ['professional-development', 'disability-specific'],
  funding: { ...base.funding, type: 'paid-placement', conditions: 'The guidelines don’t publish a pay rate.' },
  eligibility: { ...base.eligibility, scope: 'state', geography: 'New South Wales',
    geographicConfidence: 'confirmed', states: ['NSW'], disabilitySpecific: true,
    residency: 'Applicants must have lived in NSW for the past 12 months.',
    accessibility: 'Request a Word version of the form or answer two questions by video or audio.' },
  timing: { ...base.timing, observedStatus: 'open', openingDate: '2026-11-16', closingDate: '2026-12-16',
    closesAt: '2026-12-16T14:00:00+11:00', deadlineTimezone: 'Australia/Sydney' },
};

const gunyah: Opportunity = {
  ...base,
  id: 'gunyah-2027',
  title: 'Gunyah Artists-in-Residence · 2027',
  organisation: 'Gunyah Artists-in-Residence',
  officialUrl: 'https://gunyah.blogspot.com/p/apply.html',
  applicationUrl: 'https://form.jotform.com/263070266835863',
  categories: ['residency'],
  funding: { ...base.funding, type: 'participant-expenditure',
    applicationFee: { amount: 0, currency: 'AUD' }, participationFee: { amount: 470, currency: 'AUD' },
    otherCosts: 'A refundable AUD 160 cleaning and key deposit is required.' },
  timing: { ...base.timing, observedStatus: 'open', closingDate: '2026-11-30',
    closesAt: '2026-11-30T17:00:00+11:00', deadlineTimezone: 'Australia/Sydney' },
};

const downTheLane: Opportunity = {
  ...base,
  id: 'culture-focus-down-the-lane-2027',
  title: 'Down the Lane Artist Residency · 2027',
  organisation: 'Culture Focus and Down the Lane Studios',
  officialUrl: 'https://www.culturefocus.com.au/down-the-lane-residency-2027',
  applicationUrl: 'https://www.culturefocus.com.au/new-page-2',
  categories: ['residency'],
  funding: { ...base.funding, type: 'partial', minimum: 500, maximum: 500, currency: 'AUD',
    applicationFee: { amount: 50, currency: 'AUD' } },
  timing: { ...base.timing, observedStatus: 'open', openingDate: '2026-10-01',
    closingDate: '2026-12-20', deadlineTimezone: melbourne },
};

export default { opportunities: [potter, pkf, ...wyndham, creativeAustralia, archive, ramsay,
  createability, gunyah, downTheLane] };
