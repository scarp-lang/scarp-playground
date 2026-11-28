import { loadExample } from './support/example-switch';
import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';

test('module impact analyzes importers and exports only paths', async ({ page }) => {
  await page.goto('./');
  await loadExample(page, /Import a module/);
  await page.getByRole('button', { name: 'Module impact' }).click();
  const panel = page.getByRole('region', { name: 'Module change impact' });
  await expect(panel).toBeVisible();
  await panel.getByLabel('Hypothetically changed module').selectOption('math.srp');
  const affected = panel.getByLabel('Potentially affected modules');
  await expect(affected.getByRole('button', { name: 'Open possibly affected module main.srp' })).toBeVisible();
  await expect(affected.getByText(/Reason: main.srp → math.srp/)).toBeVisible();
  await panel.getByRole('button', { name: 'Dependency stages' }).click();
  await expect(panel.getByLabel('Local dependency stages')).toContainText('math.srp');

  const downloadPromise = page.waitForEvent('download');
  await panel.getByRole('button', { name: 'Download source-free impact report' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('scarp-module-impact.txt');
  const file = await download.path();
  expect(file).toBeTruthy();
  const content = await readFile(file!, 'utf8');
  expect(content).toContain('Changed source: math.srp');
  expect(content).toContain('main.srp → math.srp');
  expect(content).not.toContain('funcra twice(');
});

test('module impact navigates to the originating source file without changing code', async ({ page }) => {
  await page.goto('./');
  await loadExample(page, /Import a module/);
  await page.getByRole('button', { name: 'Module impact' }).click();
  const panel = page.getByRole('region', { name: 'Module change impact' });
  await panel.getByLabel('Hypothetically changed module').selectOption('math.srp');
  await panel.getByRole('button', { name: 'Open possibly affected module math.srp' }).click();
  await expect(page.getByRole('tab', { name: /math.srp/ })).toHaveAttribute('aria-selected', 'true');
  await panel.getByRole('button', { name: 'Other modules' }).click();
  await expect(panel.getByLabel('Modules outside dependency paths')).toBeVisible();
});

test('module impact is accessible through command palette on narrow screens', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('./');
  await page.keyboard.press('Control+Shift+P');
  const palette = page.getByRole('dialog', { name: 'Command palette' });
  await palette.getByRole('combobox', { name: 'Search commands' }).fill('Module change impact');
  await palette.getByRole('option', { name: /Module change impact/ }).click();
  await expect(page.getByRole('region', { name: 'Module change impact' })).toBeVisible();
  const width = await page.locator('body').evaluate(element => element.scrollWidth);
  expect(width).toBeLessThanOrEqual(375);
});
