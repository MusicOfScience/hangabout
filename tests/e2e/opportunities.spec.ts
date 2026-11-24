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

test('a prize shows its entry fee, local deadline and official terms', async ({ page }) => {
  await page.goto('/?mode=opportunities');
  await page.getByRole('combobox', { name: 'Category', exact: true }).selectOption('prize-award');
  const results = page.locator('#opportunityResults');
  await expect(results.getByRole('article')).toHaveCount(1);
  await expect(results).toContainText(/AUD\s*100,000/);
  await expect(results).toContainText(/AUD\s*50/);
  await results.getByRole('link', { name: 'Ramsay Art Prize 2027' }).click();
  const detail = page.locator('#opportunityDetail');
  await expect(detail).toContainText('Competitive cash prize');
  await expect(detail).toContainText(/11 Dec 2026.*5:00 pm/i);
  await expect(detail.getByRole('link', { name: 'Official entry terms' })).toHaveAttribute('href', /agsa\.sa\.gov\.au.*terms-and-conditions/);
  await detail.getByText('Funding conditions and support', { exact: true }).click();
  await expect(detail).toContainText('The winner must obtain independent legal advice at their own expense.');
  await page.getByText('More filters', { exact: true }).click();
  await page.getByLabel('Free to apply').check();
  await expect(results.getByRole('article')).toHaveCount(0);
});

test('state and access filters surface the paid Createability placement', async ({ page }) => {
  await page.goto('/?mode=opportunities');
  const region = page.getByRole('combobox', { name: 'Region', exact: true });
  const results = page.locator('#opportunityResults');
  await page.getByText('More filters', { exact: true }).click();
  await page.getByLabel('Accessibility information or disability-specific funding').check();
  await region.selectOption('QLD');
  await expect(results.getByRole('article')).toHaveCount(0);
  await region.selectOption('NSW');
  await expect(results.getByRole('article')).toHaveCount(1);
  await expect(results).toContainText('Paid placement');
  await expect(results).toContainText(/16 Dec 2026.*2:00 pm/i);
  await results.getByRole('link', { name: /Createability Internship/ }).click();
  const detail = page.locator('#opportunityDetail');
  await expect(detail).toContainText('Employment paid by the host');
  await expect(detail.getByRole('link', { name: /Official guidelines/ })).toHaveAttribute('target', '_blank');
  await detail.getByText('Eligibility and accessibility', { exact: true }).click();
  await expect(detail.getByText('Applicants must have lived in NSW for the past 12 months.')).toBeVisible();
  await detail.getByText('Funding conditions and support', { exact: true }).click();
  await expect(detail.getByText(/publish a pay rate/)).toBeVisible();
});

test('residencies keep free applications separate from participation costs', async ({ page }) => {
  await page.goto('/?mode=opportunities');
  await page.getByRole('combobox', { name: 'Category', exact: true }).selectOption('residency');
  const results = page.locator('#opportunityResults');
  await expect(results.getByRole('article')).toHaveCount(1);
  await expect(results).not.toContainText('Gunyah');
  await page.getByRole('combobox', { name: 'Application status', exact: true }).selectOption('all');
  await expect(results.getByRole('article')).toHaveCount(2);
  await expect(results.getByRole('article', { name: /Down the Lane/ })).toContainText('20 Dec 2026 · time not published');
  await page.getByText('More filters', { exact: true }).click();
  await page.getByLabel('Free to apply').check();
  await expect(results.getByRole('article')).toHaveCount(1);
  await expect(results).toContainText('Participation fee');
  await expect(results).toContainText(/AUD\s*470/);
  await results.getByRole('link', { name: /Gunyah Artists-in-Residence/ }).click();
  const detail = page.locator('#opportunityDetail');
  await expect(detail.getByRole('link', { name: 'Official guidelines' })).toHaveAttribute('href', /gunyah\.blogspot\.com/);
  await expect(detail).toContainText('Verification overdue');
  await expect(detail.getByRole('link', { name: 'Apply with the funder' })).toBeHidden();
  await detail.getByText('Funding conditions and support', { exact: true }).click();
  await expect(detail.getByText(/refundable AUD 160/)).toBeVisible();
});
