import { esc } from './html';
import { todayInTimeZone, MELBOURNE_TZ } from './time';
import {
  categories, deadlineLabel, feeLabel, fundingLabel, fundingLabels, lifecycleLabels, lifecycleOf,
  matchesOpportunity, opportunities, plainDate, rankOpportunities, states, unknown, verificationLabels,
  verificationOf, type Opportunity, type OpportunityFilters,
} from './opportunities';

const titleCase = (value: string) => value.charAt(0).toUpperCase() + value.slice(1).replaceAll('-', ' ');
const geographicEvidence = {
  confirmed: 'Geographic eligibility confirmed',
  potential: 'Potential geographic eligibility',
  unknown: 'Geographic eligibility unknown',
};
const visibleOpportunities = opportunities.filter(record =>
  record.verificationStatus !== 'quarantined' && record.verificationStatus !== 'discovery-only');
const byId = new Map(visibleOpportunities.map(record => [record.id, record]));

function options(values: Record<string, string>): string {
  return Object.entries(values).map(([value, label]) => `<option value="${esc(value)}">${esc(label)}</option>`).join('');
}

function valuesFor(values: (string[] | null)[]): Record<string, string> {
  return Object.fromEntries([...new Set(values.flatMap(value => value ?? []))].sort().map(value => [value, titleCase(value)]));
}

function select(name: string, label: string, choices: Record<string, string>, first = 'Any'): string {
  return `<label>${label}<select name="${name}">${options({ '': first, ...choices })}</select></label>`;
}

export function opportunitiesPanel(): string {
  const municipalities = valuesFor(visibleOpportunities.map(record => record.eligibility.municipalities));
  const disciplines = valuesFor(visibleOpportunities.map(record => record.eligibility.disciplines?.filter(item => item !== 'all') ?? null));
  const stages = valuesFor(visibleOpportunities.map(record => record.eligibility.careerStages));
  const currencies = valuesFor(visibleOpportunities.map(record => record.funding.currency ? [record.funding.currency] : null));
  return `
    <section id="opportunitiesPanel" class="opportunities" aria-labelledby="opportunitiesTitle" hidden>
      <section id="opportunityDetail" class="opportunity-detail" tabindex="-1" aria-labelledby="opportunityDetailTitle" hidden></section>
      <header class="opportunity-intro">
        <h1 id="opportunitiesTitle">Opportunities</h1>
        <p class="lede">Funding and professional development for Australian artists.</p>
      </header>
      <form id="opportunityFilters" class="opportunity-filters" aria-label="Filter artist opportunities">
        <label class="opportunity-search">Search opportunities
          <input class="search" name="query" type="search" autocomplete="off" placeholder="Grant, funder, place…">
        </label>
        <div class="opportunity-filter-grid">
          <label>Application status
            <select name="status">${options({
              active: 'Open & forthcoming', open: 'Open applications', 'closing-soon': 'Closing soon',
              forthcoming: 'Forthcoming', unknown: 'Status unknown', suspended: 'Suspended or cancelled',
              closed: 'Closed archive', all: 'All statuses',
            })}</select>
          </label>
          ${select('region', 'Region', { national: 'Australia-wide', international: 'International · Australian artists eligible', ...states }, 'All regions')}
          ${select('category', 'Category', categories)}
          <label>Sort by
            <select name="sort">${options({ recommended: 'Recommended', deadline: 'Earliest deadline', recent: 'Recently opened', funding: 'Largest AUD amounts' })}</select>
          </label>
        </div>
        <details class="opportunity-more-filters">
          <summary>More filters</summary>
          <div class="opportunity-filter-grid">
            ${select('municipality', 'Municipality', municipalities)}
            ${select('discipline', 'Artistic discipline', disciplines)}
            ${select('career', 'Career stage', stages)}
            ${select('verification', 'Verification', {
              verified: verificationLabels.verified, 'partially-verified': verificationLabels['partially-verified'], stale: verificationLabels.stale,
            })}
            ${select('geoConfidence', 'Geographic eligibility', { confirmed: 'Confirmed', potential: 'Potential', unknown: 'Unknown' })}
            <label>Deadline by<input name="deadline" type="date"></label>
            <label>Minimum advertised funding<input name="fundingAmount" type="number" min="0" step="any" inputmode="decimal"></label>
            <label>Funding currency<select name="fundingCurrency">${options({ AUD: 'AUD', ...currencies })}</select></label>
          </div>
          <div class="opportunity-checkboxes">
            <label><input name="free" type="checkbox"> Free to apply</label>
            <label><input name="fullyFunded" type="checkbox"> Fully funded</label>
            <label><input name="accessible" type="checkbox"> Accessibility information or disability-specific funding</label>
          </div>
        </details>
        <div class="opportunity-results-heading">
          <p id="opportunityCount" role="status" aria-live="polite"></p>
          <button class="button" type="reset">Clear filters</button>
        </div>
      </form>
      <div id="opportunityResults" tabindex="-1"></div>
    </section>`;
}

function badgeLabels(record: Opportunity, now: Date): string {
  const status = lifecycleOf(record, now);
  return `<span data-status="${status}">${lifecycleLabels[status]}</span>
    <span>${verificationLabels[verificationOf(record, now)]}</span>`;
}

function facts(items: [string, string | null][]): string {
  return `<dl class="opportunity-facts">${items.map(([name, value]) =>
    `<div><dt>${esc(name)}</dt><dd>${esc(value ?? unknown)}</dd></div>`).join('')}</dl>`;
}

function categoryLine(record: Opportunity): string {
  return record.categories.map(category => categories[category]).join(' · ');
}

function card(record: Opportunity, now: Date): string {
  return `<article class="opportunity-card" aria-labelledby="opportunity-title-${esc(record.id)}">
    <p class="opportunity-badges">${badgeLabels(record, now)}</p>
    <h2 id="opportunity-title-${esc(record.id)}"><a href="#opportunity-${esc(record.id)}">${esc(record.title)}</a></h2>
    <p class="opportunity-funder">${esc(record.organisation)}</p>
    <p class="opportunity-categories">${esc(categoryLine(record))}</p>
    ${facts([
      ['Funding', fundingLabel(record.funding)], ['Deadline', deadlineLabel(record)],
      ['Geographic eligibility', record.eligibility.geography], ['Application fee', feeLabel(record.funding.applicationFee)],
    ])}
  </article>`;
}

function canApply(record: Opportunity, now: Date): boolean {
  return ['open', 'closing-soon'].includes(lifecycleOf(record, now));
}

function detail(record: Opportunity, now: Date): string {
  const funding = record.funding;
  const eligible = record.eligibility;
  const timing = record.timing;
  const isPrize = record.categories.includes('prize-award');
  const external = (url: string, label: string, solid = false) => {
    const nswGovernment = new URL(url).hostname === 'www.nsw.gov.au';
    const newTab = nswGovernment ? ' target="_blank" rel="noopener" aria-label="' + esc(label) + ' (opens in a new tab)"' : '';
    return `<a class="button${solid ? ' solid' : ''}" href="${esc(url)}"${newTab}>${label}</a>`;
  };
  const hasExpense = Boolean(funding.coContribution || funding.otherCosts || (funding.applicationFee?.amount ?? 0) > 0
    || (funding.participationFee?.amount ?? 0) > 0 || funding.type === 'participant-expenditure');
  const list = (items: string[] | null) => items?.map(value => value === 'all' ? 'All published art forms' : titleCase(value)).join(', ') ?? null;
  return `
    <a href="#opportunityResults" class="opportunity-back">Back to opportunities</a>
    <p class="opportunity-badges" aria-live="polite">${badgeLabels(record, now)}</p>
    <h2 id="opportunityDetailTitle">${esc(record.title)}</h2>
    <p class="opportunity-funder">${esc(record.organisation)}</p>
    <p class="opportunity-categories">${esc(categoryLine(record))}</p>
    <p>${esc(record.summary)}</p>
    ${facts([
      ['Funding', fundingLabel(funding)], ['Funding type', isPrize && funding.type === 'direct' ? 'Competitive cash prize' : fundingLabels[funding.type]],
      ['Deadline', deadlineLabel(record)], ['Application fee', feeLabel(funding.applicationFee)],
      ['Participation fee', feeLabel(funding.participationFee)], ['Required contribution', funding.coContribution],
    ])}
    ${hasExpense ? '<p class="opportunity-cost-note">Applicant costs are listed here where published. Check the total cost with the funder before committing.</p>' : ''}
    <p><strong>${esc(eligible.geography ?? 'Geographic eligibility not published')}</strong> · ${geographicEvidence[eligible.geographicConfidence]}</p>
    <p>${esc(eligible.criteria ?? 'Eligibility criteria are not published in this listing.')}</p>
    <div class="opportunity-actions">
      ${record.applicationUrl ? `<span data-opportunity-apply${canApply(record, now) ? '' : ' hidden'}>${external(record.applicationUrl, 'Apply with the funder', true)}</span>` : ''}
      ${external(record.officialUrl, 'Official guidelines')}
      ${record.supportingEvidenceUrl ? external(record.supportingEvidenceUrl, isPrize ? 'Official entry terms' : 'Official eligibility FAQ') : ''}
    </div>
    <details>
      <summary>Eligibility and accessibility</summary>
      ${facts([
        ['Citizenship', eligible.citizenship], ['Residency', eligible.residency], ['Disciplines', list(eligible.disciplines)],
        ['Career stage', list(eligible.careerStages)], ['Age', eligible.age], ['Applicant type', list(eligible.applicantTypes)],
        ['Formal qualifications', eligible.qualifications], ['Other criteria', eligible.specialistCriteria],
        ['Accessibility provisions', eligible.accessibility],
      ])}
    </details>
    <details>
      <summary>Funding conditions and support</summary>
      ${facts([
        ['Funding conditions', funding.conditions], ['Travel support', funding.travel], ['Accommodation', funding.accommodation],
        ['Materials support', funding.materials], ['Other costs', funding.otherCosts],
      ])}
    </details>
    <details>
      <summary>Application requirements and timing</summary>
      ${facts([
        ['Application requirements', record.applicationRequirements], ['Selection criteria', record.selectionCriteria],
        ['Restrictions', record.restrictions], ['Application opening', timing.openingDate ? plainDate(timing.openingDate) : null],
        ['Programme commencement or earliest activity', timing.commencementDate ? plainDate(timing.commencementDate) : null],
        ['Programme duration', timing.duration], ['Recurrence', timing.recurrence],
      ])}
    </details>
    ${record.uncertainties ? `<p>${esc(record.uncertainties)}</p>` : ''}
    <p class="opportunity-verified">Checked with the funder on ${plainDate(todayInTimeZone(MELBOURNE_TZ, new Date(record.lastVerifiedAt)))}.</p>`;
}

export function initialiseOpportunities(panel: HTMLElement) {
  const form = panel.querySelector<HTMLFormElement>('#opportunityFilters')!;
  const results = panel.querySelector<HTMLElement>('#opportunityResults')!;
  const count = panel.querySelector<HTMLElement>('#opportunityCount')!;
  const detailPanel = panel.querySelector<HTMLElement>('#opportunityDetail')!;
  let activeTarget = '';
  let refreshTimer: number | undefined;

  function render() {
    const data = new FormData(form);
    const field = (name: string) => String(data.get(name) ?? '');
    const filters: OpportunityFilters = {
      status: field('status'), region: field('region'), municipality: field('municipality'),
      category: field('category'), discipline: field('discipline'), career: field('career'),
      fundingAmount: Number(field('fundingAmount')), fundingCurrency: field('fundingCurrency'),
      deadline: field('deadline'), free: data.has('free'), fullyFunded: data.has('fullyFunded'),
      accessible: data.has('accessible'), verification: field('verification'), geoConfidence: field('geoConfidence'),
      query: field('query'),
    };
    const now = new Date();
    const matching = visibleOpportunities.filter(record => matchesOpportunity(record, filters, now));
    const ranked = rankOpportunities(matching, now, field('sort'));
    count.textContent = `${ranked.length} ${ranked.length === 1 ? 'opportunity' : 'opportunities'}`;
    const markup = ranked.length ? `<div class="opportunity-list">${ranked.map(record => card(record, now)).join('')}</div>`
      : '<p class="opportunity-empty">No opportunities match these filters. Try a different application status or clear the filters.</p>';
    if (results.innerHTML !== markup) results.innerHTML = markup;
  }

  function showDetail(target: string) {
    activeTarget = target;
    detailPanel.hidden = !target.startsWith('opportunity-');
    if (detailPanel.hidden) return;
    const record = byId.get(target.slice('opportunity-'.length));
    detailPanel.innerHTML = record ? detail(record, new Date()) : `
      <h2 id="opportunityDetailTitle">Opportunity unavailable</h2>
      <a href="#opportunityResults" class="opportunity-back">Browse opportunities</a>`;
  }

  function update(target: string, visible: boolean) {
    window.clearInterval(refreshTimer);
    if (!visible) return;
    render();
    showDetail(target);
    refreshTimer = window.setInterval(() => {
      render();
      const record = byId.get(activeTarget.slice('opportunity-'.length));
      if (!record || detailPanel.hidden) return;
      const now = new Date();
      const badges = detailPanel.querySelector<HTMLElement>('.opportunity-badges')!;
      const next = badgeLabels(record, now);
      if (badges.innerHTML !== next) badges.innerHTML = next;
      const apply = detailPanel.querySelector<HTMLElement>('[data-opportunity-apply]');
      if (apply) apply.hidden = !canApply(record, now);
    }, 60_000);
  }

  form.addEventListener('submit', event => event.preventDefault());
  form.addEventListener('input', render);
  form.addEventListener('reset', () => window.setTimeout(render, 0));
  return { update };
}
