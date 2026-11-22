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

test('session-only workspace and casual rates stay out of studio rentals', async ({ page }) => {
  await page.goto('/?mode=make');
  await expect(page.locator('#resource-troppo-print-studio-open-access')).toHaveCount(0);
  const mixedUseStudio = page.locator('#resource-amegstudio-moorabbin');
  await expect(mixedUseStudio).toContainText('enquire about long-term rental');
  await expect(mixedUseStudio).not.toContainText('/hour');
  await page.getByRole('button', { name: 'advertised vacancies', exact: true }).click();
  await expect(mixedUseStudio).toHaveCount(0);
});

test('regional search separates the gallery from its changing programme', async ({ page }) => {
  await page.clock.setSystemTime(new Date('2026-11-22T00:00:00Z'));
  await page.goto('/');
  await page.locator('#searchInput').fill('New South Wales');
  await expect(page.locator('#galleryList')).toContainText('Goulburn Regional Art Gallery');
  await expect(page.locator('#map [title="Goulburn Regional Art Gallery"]')).toBeVisible();
  await expect(page.locator('#resultsList')).toContainText('The Blue Highway');
  await expect(page.locator('#resultsList')).toContainText('What are YOU Looking At?');
  await page.clock.setSystemTime(new Date('2027-02-20T00:00:00Z'));
  await page.reload();
  await page.locator('#searchInput').fill('Goulburn');
  await expect(page.locator('#resultCount')).toHaveText('0');
  await expect(page.locator('#galleryList a')).toHaveAttribute('href', 'https://goulburnregionalartgallery.com.au/exhibitions/');
});
