import { expect, test } from '@playwright/test';

const start = '2026-11-24T14:00:00Z';
const potter = 'ian-potter-cultural-trust-2027-round-1';
const pkf = 'pollock-krasner-rolling';
const wyndham = 'wyndham-2027-creative-development';

test.beforeEach(async ({ page }) => {
  await page.clock.install({ time: new Date(start) });
  await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1'
    ? route.continue() : route.abort());
});

test('opportunities integrates with both discovery modes and browser history', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /what's hanging/ })).toBeVisible();
  const nav = page.getByRole('navigation', { name: 'choose mode' });
  await nav.getByRole('button', { name: 'Opportunities' }).click();
  await expect(page).toHaveURL(/\?mode=opportunities$/);
  await expect(page.getByRole('heading', { name: 'Opportunities', exact: true })).toBeVisible();
  const linked = page.getByRole('link', { name: /Emerging Artist Grants/ });
  await linked.focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(new RegExp(`#opportunity-${potter}$`));
  const detail = page.locator('#opportunityDetail');
  await expect(detail).toBeFocused();
  await expect(detail.getByRole('link', { name: 'Apply with the funder' })).toHaveAttribute('href', /givingdata\.com/);
  await expect(detail.getByRole('link', { name: 'Official guidelines' })).toHaveAttribute('href', /ianpotterculturaltrust\.org\.au/);
  await expect(detail).toContainText('A reasonable personal contribution is required');
  await expect(detail).toContainText(/19 Jan 2027.*5:00 pm/i);
  await detail.getByText('Eligibility and accessibility', { exact: true }).click();
  await expect(detail.getByText('Formal arts qualifications are optional.')).toBeVisible();
  await page.goBack();
  await expect(detail).toBeHidden();
  await nav.getByRole('button', { name: 'make art' }).click();
  await expect(page.getByRole('heading', { name: 'rent an artist studio.' })).toBeVisible();
  await expect(page).toHaveURL(/\?mode=make$/);
  await page.goBack();
  await expect(nav.getByRole('button', { name: 'Opportunities' })).toHaveAttribute('aria-pressed', 'true');
});

test('filters combine using published currency, eligibility and fee evidence', async ({ page }) => {
  await page.goto('/?mode=opportunities');
  await page.getByRole('combobox', { name: 'Region', exact: true }).selectOption('international');
  await page.getByRole('combobox', { name: 'Category', exact: true }).selectOption('artist-grant');
  const results = page.locator('#opportunityResults');
  await expect(results.getByRole('article')).toHaveCount(1);
  await expect(results).toContainText(/USD\s*50,000/);
  await expect(results).toContainText('Application fee');
  await expect(results).toContainText('Not published');
  await page.getByText('More filters', { exact: true }).click();
  await page.getByLabel('Minimum advertised funding').fill('40000');
  await expect(results.getByRole('article')).toHaveCount(0);
  await page.getByRole('combobox', { name: 'Funding currency', exact: true }).selectOption('USD');
  await page.getByRole('combobox', { name: 'Artistic discipline', exact: true }).selectOption('printmaking');
  await page.getByRole('combobox', { name: 'Career stage', exact: true }).selectOption('established');
  await expect(results.getByRole('article')).toHaveCount(1);
  await page.getByLabel('Free to apply').check();
  await expect(results.getByRole('article')).toHaveCount(0);
  await page.getByRole('button', { name: 'Clear filters' }).click();
  await page.getByRole('combobox', { name: 'Municipality', exact: true }).selectOption('Wyndham');
  await page.getByLabel('Deadline by').fill('2026-11-27');
  await expect(results.getByRole('article')).toHaveCount(3);
  await page.getByRole('combobox', { name: 'Geographic eligibility', exact: true }).selectOption('confirmed');
  await expect(results.getByRole('article')).toHaveCount(2);
  await expect(results).not.toContainText('Presentation 2027');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('announced deadlines, expiry and stale verification are separate', async ({ page }) => {
  await page.goto(`/#opportunity-${wyndham}`);
  const detail = page.locator('#opportunityDetail');
  await expect(detail.getByText('Closing soon', { exact: true })).toBeVisible();
  await expect(detail).toContainText(/27 Nov 2026.*3:00 pm/i);
  await page.clock.setFixedTime(new Date('2026-11-27T04:00:00Z'));
  await page.reload();
  await expect(detail.getByText('Closed', { exact: true })).toBeVisible();
  await expect(detail.getByRole('link', { name: 'Apply with the funder' })).toBeHidden();

  await page.goto('/?mode=opportunities');
  await page.getByRole('combobox', { name: 'Application status', exact: true }).selectOption('forthcoming');
  const results = page.locator('#opportunityResults');
  await expect(results.getByRole('article')).toHaveCount(1);
  await expect(results).toContainText('March 2027');
  await expect(results).toContainText('Partially verified');
  await page.getByRole('combobox', { name: 'Application status', exact: true }).selectOption('closed');
  await expect(results.getByRole('article')).toHaveCount(4);

  await page.clock.setFixedTime(new Date('2027-01-01T02:00:00Z'));
  await page.goto(`/#opportunity-${pkf}`);
  await expect(detail).toContainText('Verification overdue');
  await expect(detail).toContainText('Status unknown');
  await expect(detail.getByRole('link', { name: 'Apply with the funder' })).toBeHidden();
  await expect(detail.getByRole('link', { name: 'Official guidelines' })).toBeVisible();
});
