import { expect, test } from '@playwright/test';

const payload = {
  format: 'scarp-playground-workspace', version: 1,
  workspace: { entry: 'src/main.srp', files: {
    'src/main.srp': 'import "lib/math.srp" as math;\nprint(math.twice(21));',
    'src/lib/math.srp': 'pub pure funcra twice(n: integer) -> integer { return n * 2; }',
    'other/spare.srp': '',
  } },
  activeFile: 'src/main.srp',
};

test('browses nested source paths, filters without changing collapse state and selects files', async ({ page }) => {
  await page.goto('./#project=' + encodeURIComponent(JSON.stringify(payload)));
  await page.getByRole('button', { name: 'Source explorer', exact: true }).click();
  const panel = page.getByRole('region', { name: 'Source explorer' });
  const folder = panel.getByRole('button', { name: 'Folder src/lib', exact: true });
  const math = panel.getByRole('button', { name: 'Open source src/lib/math.srp' });
  await expect(panel).toContainText('3 of 3 source files');
  await folder.click();
  await expect(folder).toHaveAttribute('aria-expanded', 'false');
  await expect(math).toHaveCount(0);
  await panel.getByLabel('Filter paths').fill('MATH');
  await expect(panel).toContainText('1 of 3 source files');
  await expect(math).toBeVisible();
  await math.click();
  await expect(page.getByRole('tab', { name: /src\/lib\/math.srp/ })).toHaveAttribute('aria-selected', 'true');
  await panel.getByRole('button', { name: 'Clear filter' }).click();
  await expect(folder).toHaveAttribute('aria-expanded', 'false');
  await expect(math).toHaveCount(0);
  await folder.click();
  await expect(math).toHaveAttribute('aria-current', 'true');
  await page.getByRole('button', { name: 'Run code' }).click();
  await expect(page.locator('.stdout')).toHaveText('42\n', { timeout: 30_000 });
});

test('creates a nested module through an explicit path form, rejects collisions and undoes creation', async ({ page }) => {
  await page.goto('./#project=' + encodeURIComponent(JSON.stringify(payload)));
  await page.getByRole('button', { name: 'Source explorer', exact: true }).click();
  const panel = page.getByRole('region', { name: 'Source explorer' });
  await panel.getByRole('button', { name: 'Create source in src/lib', exact: true }).click();
  const path = panel.getByLabel('New source path');
  await expect(path).toHaveValue('src/lib/');
  await path.fill('src/lib/math.srp');
  await panel.getByRole('button', { name: 'Create source file' }).click();
  await expect(panel).toContainText('already exists');
  await path.fill('src/lib/new.srp');
  await panel.getByRole('button', { name: 'Create source file' }).click();
  await expect(panel).toContainText('4 of 4 source files');
  await expect(page.getByRole('tab', { name: /src\/lib\/new.srp/ })).toHaveAttribute('aria-selected', 'true');
  await expect(panel.getByRole('button', { name: 'Open source src/lib/new.srp' })).toBeVisible();
  await page.getByRole('button', { name: 'Undo bulk change' }).click();
  await expect(panel).toContainText('3 of 3 source files');
  await expect(page.getByRole('tab', { name: /src\/lib\/new.srp/ })).toHaveCount(0);
});

test('keeps the explorer usable on narrow viewports', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('./#project=' + encodeURIComponent(JSON.stringify(payload)));
  await page.getByRole('button', { name: 'Source explorer', exact: true }).click();
  const panel = page.getByRole('region', { name: 'Source explorer' });
  await expect(panel).toBeVisible();
  expect(await page.locator('body').evaluate(element => element.scrollWidth)).toBeLessThanOrEqual(375);
  await panel.getByRole('button', { name: 'Close explorer' }).click();
  await expect(panel).toHaveCount(0);
});
