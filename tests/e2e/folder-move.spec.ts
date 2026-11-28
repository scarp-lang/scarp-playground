import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

async function openProject(page: Page) {
  const workspace = { entry: 'app/main.srp', files: {
    'app/main.srp': 'import "./math.srp" as math;\nimport "../shared/value.srp" as value;\nprint(math.twice(value.answer));\n',
    'app/math.srp': 'pub pure funcra twice(n: integer) -> integer { return n * 2; }\n',
    'shared/value.srp': 'pub bind answer = 21;\n',
    'check.srp': 'import r"app/math.srp" as math;\nprint(math.twice(21));\n',
  } };
  const payload = { format: 'scarp-playground-workspace', version: 1, workspace, activeFile: 'app/math.srp' };
  await page.goto('./#project=' + encodeURIComponent(JSON.stringify(payload)));
  await page.getByRole('button', { name: 'Move folder', exact: true }).click();
  return page.getByRole('region', { name: 'Move source folder' });
}

test('reviews, applies, executes and undoes a multi-file folder move', async ({ page }) => {
  const panel = await openProject(page);
  await panel.getByLabel('Current folder').selectOption('app');
  await panel.getByLabel('New relative folder path').fill('src/features');
  await panel.getByRole('button', { name: 'Preview folder move' }).click();
  const review = panel.getByLabel('Folder move review');
  await expect(review).toContainText('Move 2 source files and rewrite 2 import path(s)');
  await expect(review).toContainText('Entry changes to src/features/main.srp');
  await expect(review).toContainText('import "../../shared/value.srp" as value;');
  await expect(review).toContainText('import r"src/features/math.srp" as math;');
  await expect(page.getByRole('tab', { name: /src\/features\/math.srp/ })).toHaveCount(0);
  await panel.getByRole('button', { name: 'Apply folder move' }).click();
  await expect(panel).toHaveCount(0);
  await expect(page.getByRole('tab', { name: /src\/features\/math.srp/ })).toHaveAttribute('aria-selected', 'true');
  await page.getByRole('button', { name: 'Run code' }).click();
  await expect(page.locator('.stdout')).toHaveText('42\n', { timeout: 30_000 });
  await page.getByRole('button', { name: 'Undo bulk change' }).click();
  await expect(page.getByRole('tab', { name: /app\/math.srp/ })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('tab', { name: /src\/features\/math.srp/ })).toHaveCount(0);
  await page.getByRole('button', { name: 'Run code' }).click();
  await expect(page.locator('.stdout')).toHaveText('42\n', { timeout: 30_000 });
});

test('rejects occupied destinations and invalidates edited previews on narrow screens', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  const panel = await openProject(page);
  await panel.getByLabel('Current folder').selectOption('app');
  const destination = panel.getByLabel('New relative folder path');
  await destination.fill('shared');
  await panel.getByRole('button', { name: 'Preview folder move' }).click();
  await expect(panel).toContainText('already contains source files');
  await expect(panel.getByRole('button', { name: 'Apply folder move' })).toHaveCount(0);
  await destination.fill('src/features');
  await panel.getByRole('button', { name: 'Preview folder move' }).click();
  await expect(panel.getByRole('button', { name: 'Apply folder move' })).toBeVisible();
  await destination.fill('src/other');
  await expect(panel.getByRole('button', { name: 'Apply folder move' })).toHaveCount(0);
  expect(await page.locator('body').evaluate(element => element.scrollWidth)).toBeLessThanOrEqual(375);
  await panel.getByRole('button', { name: 'Cancel folder move' }).click();
  await expect(panel).toHaveCount(0);
  await expect(page.getByRole('tab', { name: /app\/math.srp/ })).toBeVisible();
});
