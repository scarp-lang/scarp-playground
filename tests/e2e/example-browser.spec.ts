import { expect, test } from '@playwright/test';

test('filter examples by compiler version and open the original matching program', async ({ page }) => {
  await page.goto('./');
  const filter = page.getByRole('searchbox', { name: 'Find an example' });
  await expect(filter).toBeVisible();

  await filter.fill('alpha.14');
  await expect(page.locator('.example-button')).toHaveCount(2);
  await expect(page.locator('.example-filter-count')).toHaveText(/2 of \d+ examples/);
  await page.locator('.example-button').filter({
    has: page.getByText('Ordered string-map projections', { exact: true }),
  }).click();

  await page.getByRole('button', { name: 'Verify code' }).click();
  await expect(page.locator('.terminal-output')).toContainText('Static verification passed', {
    timeout: 30_000,
  });
});

test('searches descriptions, explains empty results and clears with button or Escape', async ({ page }) => {
  await page.goto('./');
  const filter = page.getByRole('searchbox', { name: 'Find an example' });
  const buttons = page.locator('.example-button');
  const allCount = await buttons.count();

  await filter.fill('tuple alpha.14');
  await expect(buttons).toHaveCount(1);
  await expect(buttons.first()).toContainText('Nested pattern matching');

  await filter.fill('nothing_matches_this_example');
  await expect(buttons).toHaveCount(0);
  await expect(page.getByText(/No examples match your search/)).toBeVisible();

  await page.getByRole('button', { name: 'Clear example filter' }).click();
  await expect(buttons).toHaveCount(allCount);

  await filter.fill('alpha.12');
  await expect(buttons).toHaveCount(6);
  await filter.press('Escape');
  await expect(filter).toHaveValue('');
  await expect(buttons).toHaveCount(allCount);
});
