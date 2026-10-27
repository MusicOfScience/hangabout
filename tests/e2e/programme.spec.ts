import { expect, test } from '@playwright/test';

const transparentPng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL4WQAAAABJRU5ErkJggg==',
  'base64',
);

test.beforeEach(async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-27T13:22:00Z') }); // 28 Oct, 00:22 AEDT
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

test('programme panel defaults to the next seven days with verified records', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#programmePanel')).toBeVisible();
  await expect(page.locator('#programmeCount')).toHaveText('2');
  await expect(page.locator('#programmeList .programme-card')).toHaveCount(2);
  await expect(page.locator('#programmeList')).toContainText('a/part: Friendship as Practice');
  await expect(page.locator('#programmeList')).toContainText('Chinese Language Tour');
});

test('tonight uses an honest incomplete-coverage empty state', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'tonight', exact: true }).click();
  await expect(page.locator('#programmeCount')).toHaveText('0');
  await expect(page.locator('#programmeList')).toContainText('Nothing verified for tonight yet.');
  await expect(page.locator('#programmeList')).toContainText('coverage is incomplete');
});

test('programme search includes workshops and practical booking facts', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'all upcoming', exact: true }).click();
  await page.locator('#searchInput').fill('workshop');
  await expect(page.locator('#programmeList .programme-card')).toHaveCount(3);
  const miniMe = page.locator('#programme-glen-eira-mini-me-makers-2026-11-08');
  await expect(miniMe).toContainText('Yasmin Gaté née del Mar · facilitator');
  await expect(miniMe).toContainText('$7');
  await expect(miniMe).toContainText('bookings required');
  await expect(miniMe).toContainText('All materials supplied.');
});

test('first-party time wins over a conflicting discovery-calendar observation', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'all upcoming', exact: true }).click();
  const tour = page.locator('#programme-acca-audio-described-tactile-tour-new26-2026-11-14');
  await expect(tour).toContainText('11:15am–1:15pm');
});

test('unknown programme end time stays unknown rather than receiving an invented duration', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'all upcoming', exact: true }).click();
  const apw = page.locator('#programme-apw-impressions-45-years-opening-2026-11-06');
  await expect(apw).toContainText('Fri, 6 Nov · 6:00pm');
  await expect(apw).not.toContainText('8:00pm');
});
