import { loadExample } from './support/example-switch';
import { expect, test } from '@playwright/test';

test('batch move previews rebased imports and permits atomic undo', async ({ page }) => {
  await page.goto('./');
  await loadExample(page, /Import a module/);
  await page.getByRole('button', { name: 'Batch rename' }).click();
  const panel = page.getByRole('region', { name: 'Batch source file rename' });
  await expect(panel).toBeVisible();
  await panel.getByLabel('Destination for math.srp').fill('lib/math.srp');
  await panel.getByRole('button', { name: 'Preview batch rename' }).click();
  const reviewed = panel.getByLabel('Reviewed batch rename');
  await expect(reviewed).toContainText('1 file(s) moved');
  await expect(reviewed).toContainText('import(s) rebased');
  await expect(reviewed).toContainText('lib/math.srp');
  await reviewed.getByRole('button', { name: /Show verified import mappings/ }).click();
  await expect(reviewed.getByLabel('Verified unchanged module references'))
    .toContainText('lib/math.srp');

  page.once('dialog', dialog => void dialog.accept());
  await reviewed.getByRole('button', { name: 'Apply batch rename' }).click();
  await expect(panel).not.toBeVisible();
  await expect(page.getByRole('tab', { name: /lib\/math.srp/ })).toBeVisible();
  await page.getByRole('button', { name: 'Run code' }).click();
  await expect(page.locator('.stdout')).toHaveText('42\n', { timeout: 30_000 });
  await page.getByRole('button', { name: 'Undo bulk change' }).click();
  await expect(page.getByRole('tab', { name: /math.srp/ })).toBeVisible();
});

test('batch rename supports simultaneous file path swaps', async ({ page }) => {
  await page.goto('./');
  await loadExample(page, /Import a module/);
  await page.getByRole('button', { name: 'Batch rename' }).click();
  const panel = page.getByRole('region', { name: 'Batch source file rename' });
  await panel.getByLabel('Destination for main.srp').fill('math.srp');
  await panel.getByLabel('Destination for math.srp').fill('main.srp');
  await panel.getByRole('button', { name: 'Preview batch rename' }).click();
  await expect(panel.getByLabel('Reviewed batch rename')).toContainText('2 file(s) moved');
  page.once('dialog', dialog => void dialog.accept());
  await panel.getByRole('button', { name: 'Apply batch rename' }).click();
  await page.getByRole('button', { name: 'Run code' }).click();
  await expect(page.locator('.stdout')).toHaveText('42\n', { timeout: 30_000 });
});

test('batch rename rejects collisions without touching project sources', async ({ page }) => {
  await page.goto('./');
  await loadExample(page, /Import a module/);
  await page.getByRole('button', { name: 'Batch rename' }).click();
  const panel = page.getByRole('region', { name: 'Batch source file rename' });
  await panel.getByLabel('Destination for math.srp').fill('main.srp');
  await panel.getByRole('button', { name: 'Preview batch rename' }).click();
  await expect(panel.getByRole('alert')).toContainText('overwrite');
  await expect(panel.getByRole('button', { name: 'Apply batch rename' })).toHaveCount(0);
  await panel.getByRole('button', { name: 'Close batch file rename' }).click();
  await page.getByRole('button', { name: 'Run code' }).click();
  await expect(page.locator('.stdout')).toHaveText('42\n', { timeout: 30_000 });
});

test('batch rename is accessible from command palette and fits mobile', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('./');
  await page.keyboard.press('Control+Shift+P');
  const palette = page.getByRole('dialog', { name: 'Command palette' });
  await palette.getByRole('combobox', { name: 'Search commands' }).fill('Batch source file rename');
  await palette.getByRole('option', { name: /Batch source file rename/ }).click();
  const panel = page.getByRole('region', { name: 'Batch source file rename' });
  await expect(panel).toBeVisible();
  await expect(panel.getByLabel('Destination for main.srp')).toBeVisible();
  const width = await page.locator('body').evaluate(element => element.scrollWidth);
  expect(width).toBeLessThanOrEqual(375);
});
