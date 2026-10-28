#!/usr/bin/env python3
from pathlib import Path

main = Path('src/main.ts')
text = main.read_text()
text = text.replace(
    "import { matchesStudioQuery, studioMonthlyAmount, studioRelevance } from './studio-search';\n",
    "import { matchesStudioQuery, studioMonthlyAmount, studioRelevance } from './studio-search';\nimport { groupEventsByVenue, type VenueEventGroup } from './venue-cards';\n",
)
text = text.replace(
    "function renderSee(focusMap = false) {\n  const rows = filteredEvents();\n  els.resultCount.textContent = String(rows.length);\n",
    "function renderSee(focusMap = false) {\n  const rows = filteredEvents();\n  const groups = groupEventsByVenue(rows, venueById);\n  els.resultCount.textContent = String(rows.length);\n",
)
text = text.replace(
    "  els.mappedCount.textContent = `· ${exactMapped} exact pins${approximate ? ` · ${approximate} area-matched spaces` : ''}`;\n",
    "  els.mappedCount.textContent = `· ${groups.length} ${groups.length === 1 ? 'venue' : 'venues'} · ${exactMapped} exact pins${approximate ? ` · ${approximate} area-matched spaces` : ''}`;\n",
)
text = text.replace(
    "  els.results.innerHTML = rows.map(eventCard).join('') ||\n",
    "  els.results.innerHTML = groups.map(venueCard).join('') ||\n",
)

start = text.index('function eventCard(event: Event): string {')
end = text.index('\nfunction openDetail(eventId: string)', start)
replacement = r'''function venueCard(group: VenueEventGroup): string {
  const { venue, events } = group;
  const distance = state.userLocation && venuePoint(venue)
    ? `${haversine(state.userLocation, venuePoint(venue)!).toFixed(1)} km`
    : '';
  return `
    <article class="event-card venue-card" data-venue="${esc(venue.id)}">
      <div class="card-top">
        <span class="kind">${esc(venue.kind.replaceAll('-', ' '))}</span>
        <span>${events.length} ${events.length === 1 ? 'exhibition' : 'exhibitions'}</span>
      </div>
      <h3>${esc(venue.name)}</h3>
      <p class="venue-line">${esc(venue.suburb)}${distance ? ` · ${distance}` : ''}</p>
      <div class="meta venue-meta">
        ${venue.lat != null ? '<span>exact pin</span>' : '<span>area location</span>'}
      </div>
      <div class="venue-exhibitions">
        ${events.map(event => exhibitionEntry(event)).join('')}
      </div>
    </article>
  `;
}

function exhibitionEntry(event: Event): string {
  const freshness = eventFreshness(event);
  const saved = state.saved.has(event.id);
  const inCrawl = state.crawl.has(event.id);
  return `
    <section class="exhibition-entry" id="event-${esc(event.id)}" tabindex="-1">
      <div class="exhibition-date">${esc(formatDateRange(event.startDate, event.endDate))}</div>
      <h4>${esc(event.title)}</h4>
      <p class="artists">${esc(event.artists.join(', '))}</p>
      <div class="meta">
        <span>${event.sourceType === 'official' ? 'official source' : 'directory source'}</span>
        ${event.admission === 'free' ? '<span>free</span>' : ''}
      </div>
      <p class="freshness freshness-${freshness.state}">checked ${esc(formatChecked(event.lastVerified))} · ${freshness.state === 'stale' ? 'programme needs rechecking — confirm with the source' : freshness.relativeLabel}</p>
      <div class="card-actions">
        <button class="text-link" data-detail="${esc(event.id)}" aria-label="details for ${esc(event.title)}">details</button>
        <button class="text-link" data-save="${esc(event.id)}" aria-label="${saved ? 'remove saved' : 'save'} ${esc(event.title)}">${saved ? 'saved ✓' : 'save'}</button>
        <button class="text-link" data-crawl="${esc(event.id)}" aria-label="${inCrawl ? 'remove from crawl' : 'add to crawl'} ${esc(event.title)}">${inCrawl ? 'in crawl ✓' : 'add to crawl'}</button>
      </div>
    </section>
  `;
}
'''
text = text[:start] + replacement + text[end:]
main.write_text(text)

styles = Path('src/styles.css')
css = styles.read_text()
css = css.replace(
    ".event-card, .resource-card { scroll-margin-top: 4rem; }\n.event-card:target, .event-card:focus, .resource-card:target, .resource-card:focus { background: color-mix(in srgb, var(--accent) 28%, var(--panel)); }\n",
    ".event-card, .resource-card, .exhibition-entry { scroll-margin-top: 4rem; }\n.resource-card:target, .resource-card:focus, .exhibition-entry:target, .exhibition-entry:focus { background: color-mix(in srgb, var(--accent) 28%, var(--panel)); }\n",
)
marker = ".card-actions { display: flex; gap: 1rem; margin-top: 1rem; flex-wrap: wrap; }\n"
addition = """.venue-card > h3 { margin-bottom: .25rem; }\n.venue-card > .venue-line { margin: 0; }\n.venue-meta { margin-bottom: .75rem; }\n.venue-exhibitions { margin-top: .85rem; border-top: 1px solid var(--line); }\n.exhibition-entry { padding: 1rem 0; border-bottom: 1px solid var(--line); }\n.exhibition-entry:last-child { border-bottom: 0; padding-bottom: .2rem; }\n.exhibition-entry:focus { outline: 0; padding-inline: .45rem; margin-inline: -.45rem; }\n.exhibition-date { color: var(--muted); font-size: .72rem; text-transform: uppercase; letter-spacing: .07em; }\n.exhibition-entry h4 { margin: .45rem 0 .25rem; font-size: clamp(1.25rem, 2.4vw, 1.8rem); line-height: 1.05; letter-spacing: -.025em; }\n.exhibition-entry .artists { margin-bottom: .55rem; }\n.exhibition-entry .freshness { margin-bottom: .2rem; }\n"""
css = css.replace(marker, marker + addition)
styles.write_text(css)

test = Path('tests/e2e/hangabout.spec.ts')
tests = test.read_text().replace(
    "  await firstCard.getByRole('button', { name: /^save / }).click();\n",
    "  await firstCard.getByRole('button', { name: /^save / }).first().click();\n",
)
test.write_text(tests)

current = Path('tests/e2e/current-exhibitions.spec.ts')
current_text = current.read_text()
if "multiple exhibitions at one gallery share one venue card" not in current_text:
    current_text += r'''

test('multiple exhibitions at one gallery share one venue card', async ({ page }) => {
  await page.goto('/');

  const unboundCard = page.locator('.event-card', {
    has: page.locator('#event-gallery-unbound-alena-landers-wildflowers-2026'),
  });
  await expect(unboundCard).toHaveCount(1);
  await expect(unboundCard).toContainText('Gallery Unbound');
  await expect(unboundCard.locator('.exhibition-entry')).toHaveCount(5);
  await expect(unboundCard.locator('#event-gallery-unbound-alena-landers-wildflowers-2026')).toBeVisible();
});
'''
current.write_text(current_text)
