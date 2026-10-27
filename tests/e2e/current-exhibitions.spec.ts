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
  await expect(page.locator('#event-gallery-unbound-alena-landers-wildflowers-2026')).toBeVisible();
  await expect(page.locator('#event-gallery-unbound-dieter-kraus-retrospective-2026')).toBeVisible();
  await expect(page.locator('#event-acca-new26')).toBeVisible();

  // Upcoming records can coexist with current records; the default catalogue is not
  // a "new only" feed.
  await expect(page.locator('#event-buxton-a-part-hoda-afshar')).toBeVisible();
});
