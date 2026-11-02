import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.clock.install({ time: new Date('2026-11-03T01:19:00+11:00') });
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    return url.hostname === '127.0.0.1' ? route.continue() : route.abort();
  });
});

test('APW and Firestation surface first-party current or imminent exhibitions', async ({ page }) => {
  await page.goto('/');

  const apw = page.locator('#event-apw-impressions-45-years-in-print-2026');
  await expect(apw).toBeVisible();
  await expect(apw).toContainText('IMPRESSIONS: 45 Years in Print');
  await expect(apw).toContainText('6 Nov 2026 — Feb 2027');

  const firestation = page.locator('#event-firestation-lindesay-dresdon-2026');
  await expect(firestation).toBeVisible();
  await expect(firestation).toContainText('Lindesay Dresdon');
});

test('Firestation artist studios appear in the default studio surface', async ({ page }) => {
  await page.goto('/?mode=make');
  await expect(page.locator('#resource-firestation-artist-studios')).toBeVisible();
  await expect(page.locator('#resource-firestation-artist-studios')).toContainText('waiting list / register interest');
});

test('Troppo appears in all making resources', async ({ page }) => {
  await page.goto('/?mode=make');
  await page.locator('#makeKind').selectOption('resources');
  await expect(page.locator('#resource-troppo-print-studio-open-access')).toBeVisible();
});
