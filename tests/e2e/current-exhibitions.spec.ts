import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-28T05:26:00+11:00') });
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    return url.hostname === '127.0.0.1' ? route.continue() : route.abort();
  });
});

test('default see-art view contains exhibitions already on, not only upcoming shows', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('button', { name: 'everything', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(async () => Number(await page.locator('#resultCount').textContent())).toBeGreaterThan(8);

  // Current exhibitions across different venue types must be present before opening hours.
  await expect(page.locator('#event-gallery-unbound-alena-landers-wildflowers-2026')).toBeVisible();
  await expect(page.locator('#event-bsg-lana-eileen-understory-2026')).toBeVisible();
  await expect(page.locator('#event-kings-parker-lev-dupain-bird-in-space-2026')).toBeVisible();
  await expect(page.locator('#event-craft-flawed-julienne-lewis-2026')).toBeVisible();
  await expect(page.locator('#event-muma-pitcha-makin-fellas-long-time-coming-2026')).toBeVisible();
  await expect(page.locator('#event-charles-nodrum-jan-murray-rapt-2026')).toBeVisible();
  await expect(page.locator('#event-heide-brassai-secret-paris-2026')).toBeVisible();
  await expect(page.locator('#event-acca-new26')).toBeVisible();

  // Upcoming records can coexist with current records; the default catalogue is not
  // a "new only" feed.
  await expect(page.locator('#event-buxton-a-part-hoda-afshar')).toBeVisible();
});


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
