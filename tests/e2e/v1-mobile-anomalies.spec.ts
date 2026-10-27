import { expect, test } from '@playwright/test';

const transparentPng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL4WQAAAABJRU5ErkJggg==',
  'base64',
);

const fixtureLocation = { latitude: -37.766, longitude: 144.962 };

test.beforeEach(async ({ page }) => {
  // 28 Oct 2026 in Melbourne: old opportunity/vacancy claims should have failed closed.
  await page.clock.install({ time: new Date('2026-10-28T02:00:00Z') });
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

test('expired opportunities do not remain in the live opportunities view', async ({ page }) => {
  await page.goto('/?mode=make');
  await page.locator('#makeKind').selectOption('opportunity');

  await expect(page.getByText('Craft Crits — August', { exact: true })).toHaveCount(0);
  await expect(page.locator('#makeResults')).not.toContainText('Craft Crits — August');
});

test('stale availability is historical evidence, not an available-now claim', async ({ page }) => {
  await page.goto('/?mode=make');
  await page.locator('#makeKind').selectOption('resources');

  const peaGreenBoat = page.locator('#resource-pea-green-boat-studios');
  await expect(peaGreenBoat).toBeVisible();
  await expect(peaGreenBoat).toContainText('previously listed: advertised as available');
  await expect(peaGreenBoat).not.toContainText('previously listed: available now');
});

test('make-art near-me map stays centred on the user after mode switches', async ({ page, context }) => {
  await context.grantPermissions(['geolocation'], { origin: 'http://127.0.0.1:4173' });
  await context.setGeolocation(fixtureLocation);
  await page.goto('/?mode=make');

  await page.getByRole('button', { name: 'sort near me', exact: true }).click();
  await expect(page.locator('#makeStatus')).toContainText('nearest resources first');

  const readCenter = () => page.evaluate(() => {
    const map = (window as typeof window & {
      hangaboutMakeMap?: { center(): [number, number] };
    }).hangaboutMakeMap;
    return map?.center() ?? null;
  });

  const centredNearFixture = async () => {
    const center = await readCenter();
    expect(center).not.toBeNull();
    expect(Math.abs(center![0] - fixtureLocation.latitude)).toBeLessThan(0.01);
    expect(Math.abs(center![1] - fixtureLocation.longitude)).toBeLessThan(0.01);
  };

  await centredNearFixture();
  await page.getByRole('button', { name: 'see art', exact: true }).click();
  await page.getByRole('button', { name: 'make art', exact: true }).click();
  await centredNearFixture();
});
