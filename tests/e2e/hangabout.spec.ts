import { expect, test } from '@playwright/test';

const transparentPng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL4WQAAAABJRU5ErkJggg==',
  'base64',
);

test.beforeEach(async ({ page }) => {
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
  await expect(page.locator('#makeCount')).toHaveText('17 studios');
  await page.getByRole('button', { name: '24/7 access', exact: true }).click();
  await expect(page.locator('#makeCount')).toHaveText('12 studios');
  await page.getByRole('button', { name: '24/7 access', exact: true }).click();
  await expect(page.locator('#makeCount')).toHaveText('17 studios');
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
