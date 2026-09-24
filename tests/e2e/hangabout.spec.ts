import { expect, test } from '@playwright/test';

const transparentPng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL4WQAAAABJRU5ErkJggg==',
  'base64',
);

test.beforeEach(async ({ page }) => {
  // The checked-in catalogue is the fixture; release freshness uses the real clock.
  // Let time advance so Leaflet's Date.now()-based pan animations can finish.
  await page.clock.install({ time: new Date('2026-08-26T02:00:00Z') });
  // Keep interaction regressions independent of live discovery and external services.
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    return url.hostname === '127.0.0.1' ? route.continue() : route.abort();
  });
  await page.route('https://tile.openstreetmap.org/**', route => route.fulfill({
    status: 200,
    contentType: 'image/png',
    body: transparentPng,
  }));
});

test('a direct studio link opens make art and reveals its listing', async ({ page }) => {
  await page.goto('/#resource-pink-ember-studios-coburg');

  await expect(page.getByRole('button', { name: 'make art', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#makePanel')).toBeVisible();
  await expect(page.locator('#resource-pink-ember-studios-coburg')).toBeVisible();
  await expect(page.locator('#resource-pink-ember-studios-coburg')).toBeFocused();
});

test('the former v2 path redirects to the canonical root and preserves its target', async ({ page }) => {
  await page.goto('/v2/#resource-pink-ember-studios-coburg');

  await expect(page).toHaveURL(/\/#resource-pink-ember-studios-coburg$/);
  await expect(page.getByRole('button', { name: 'make art', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#resource-pink-ember-studios-coburg')).toBeFocused();
});

test('mode changes participate in browser history', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'make art', exact: true }).click();
  await expect(page).toHaveURL(/\?mode=make$/);
  await page.getByRole('button', { name: 'see art', exact: true }).click();
  await expect(page).toHaveURL(/\/$/);

  await page.goBack();
  await expect(page.getByRole('button', { name: 'make art', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.goBack();
  await expect(page.getByRole('button', { name: 'see art', exact: true })).toHaveAttribute('aria-pressed', 'true');
});

test('map popups navigate to their visible list result', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'make art', exact: true }).click();
  await page.locator('#makeMap .leaflet-marker-icon[title^="Brunswick:"]').click();
  const listLink = page.locator('#makeMap .leaflet-popup').getByRole('link', { name: 'show in list ↓' }).first();
  const href = await listLink.getAttribute('href');
  await listLink.click();

  expect(href).toMatch(/^#resource-/);
  await expect(page.locator(href!)).toBeFocused();
  await expect(page.locator(href!)).toBeVisible();
});

test('saved exhibitions and studio feature filters remain functional', async ({ page }) => {
  await page.goto('/');
  const firstCard = page.locator('.event-card').first();
  await firstCard.getByRole('button', { name: /^save / }).click();
  await page.getByRole('button', { name: 'saved', exact: true }).click();
  await expect(page.locator('.event-card')).toHaveCount(1);

  await page.getByRole('button', { name: 'make art', exact: true }).click();
  await expect(page.locator('#makeCount')).toHaveText('18 studios');
  await page.getByRole('button', { name: '24/7 access', exact: true }).click();
  await expect(page.locator('#makeCount')).toHaveText('12 studios');
  await page.getByRole('button', { name: '24/7 access', exact: true }).click();
  await expect(page.locator('#makeCount')).toHaveText('18 studios');
});

test('event dates are timezone-stable and cross-year ranges show both years', async ({ page }) => {
  await page.goto('/');
  const card = page.locator('.event-card', { hasText: 'Art of the Pacific: From the NGV Collection' });
  await expect(card).toContainText('15 Nov 2025 — 4 Oct 2026');
});

test('make-art map refits after every switch without overlapping the search', async ({ page, isMobile }) => {
  await page.goto('/');

  for (let attempt = 0; attempt < 3; attempt += 1) {
    await page.getByRole('button', { name: 'make art', exact: true }).click();
    await expect.poll(async () => page.locator('#makeMap img.leaflet-tile').evaluateAll(images =>
      [...new Set(images.map(image => Number((image.getAttribute('src') ?? '').split('/').at(-3))))],
    )).toEqual([10]);
    await page.getByRole('button', { name: 'see art', exact: true }).click();
  }

  await page.getByRole('button', { name: 'make art', exact: true }).click();
  if (isMobile) {
    const note = await page.locator('.make-map-note').boundingBox();
    const search = await page.locator('#makeSearch').boundingBox();
    expect(note).not.toBeNull();
    expect(search).not.toBeNull();
    expect(note!.y + note!.height).toBeLessThanOrEqual(search!.y);
  }
});

test('stale studio vacancies stay visible while source-rechecked listings qualify as available now', async ({ page }) => {
  await page.clock.setSystemTime(new Date('2026-09-23T02:00:00Z'));
  await page.goto('/?mode=make');
  await expect(page.locator('#resource-b2-window-room-brunswick')).toContainText('previously listed: available from 1 Aug 2026');
  await page.getByRole('button', { name: 'vacancies now', exact: true }).click();
  await expect(page.locator('.resource-card')).not.toHaveCount(0);
  await expect(page.locator('#resource-b2-window-room-brunswick')).toHaveCount(0);
  await expect(page.locator('#resource-brunswick-bower')).toBeVisible();
  await page.getByRole('button', { name: 'vacancies now', exact: true }).click();
  await expect(page.locator('.resource-card')).not.toHaveCount(0);
});

test('recently checked vacancies still qualify as available now', async ({ page }) => {
  await page.goto('/?mode=make');
  await page.getByRole('button', { name: 'vacancies now', exact: true }).click();
  await expect(page.locator('#resource-pink-ember-studios-coburg')).toBeVisible();
  await expect(page.locator('#resource-brunswick-street-gallery-studio')).toHaveCount(0);
});

test('stale exhibition programmes show a recheck notice on the card', async ({ page }) => {
  await page.clock.setSystemTime(new Date('2026-09-23T02:00:00Z'));
  await page.goto('/');
  await expect(page.locator('#event-ngv-art-of-the-pacific')).toContainText('programme needs rechecking');
});

const candidate = (name: string) => ({ elements: [{
  type: 'node', id: 987654321, lat: -37.81, lon: 144.96,
  tags: { name, tourism: 'gallery' },
}] });

async function searchMap(page: import('@playwright/test').Page) {
  await expect(page.locator('#liveDiscoveryStatus')).toBeAttached();
  await expect(page.locator('#map')).not.toHaveClass(/leaflet-zoom-anim/);
  await page.locator('#map .leaflet-control-zoom-in').click();
  await expect(page.locator('#map')).not.toHaveClass(/leaflet-zoom-anim/);
  await expect(page.locator('#searchArea')).toBeVisible();
  await page.locator('#searchArea').click();
}

test('gallery discovery survives label-service failure and retries failed searches', async ({ page }) => {
  let requests = 0;
  await page.route('https://nominatim.openstreetmap.org/**', route => route.fulfill({ status: 503, body: '' }));
  await page.route('https://*/api/interpreter', route => {
    requests += 1;
    return requests <= 2
      ? route.fulfill({ status: 503, body: '' })
      : route.fulfill({ json: candidate('Recovered fixture gallery') });
  });
  await page.goto('/');
  await searchMap(page);
  await expect(page.locator('#liveDiscoveryStatus')).toContainText('temporarily unavailable');
  await expect(page.locator('#searchArea')).toBeVisible();
  await page.locator('#searchArea').click();
  await expect(page.locator('#liveAreaResults')).toContainText('Recovered fixture gallery');
  expect(requests).toBe(3);
});

test('moving the map discards a late gallery response', async ({ page }) => {
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  let requested = false;
  await page.route('https://nominatim.openstreetmap.org/**', route => route.fulfill({ json: { address: { city: 'Fixture town' } } }));
  await page.route('https://*/api/interpreter', async route => {
    requested = true;
    await held;
    await route.fulfill({ json: candidate('Obsolete fixture gallery') });
  });
  await page.goto('/');
  await searchMap(page);
  await expect.poll(() => requested).toBe(true);
  await page.locator('#map .leaflet-control-zoom-in').click();
  await expect(page.locator('#liveDiscoveryStatus')).toContainText('map moved');
  const response = page.waitForResponse('https://*/api/interpreter');
  release();
  await (await response).finished();
  // Flush rendering after the fulfilled fetch; the stale response must not repaint.
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  await expect(page.locator('#liveDiscoveryStatus')).toContainText('map moved');
  await expect(page.locator('#liveAreaResults')).not.toContainText('Obsolete fixture gallery');
  await expect(page.locator('#webSuburb')).toHaveText('this map area');
});
