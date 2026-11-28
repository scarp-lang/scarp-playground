import { expect, test } from '@playwright/test';

function url(main: string, files: Record<string, string> = {}) {
  return './#project=' + encodeURIComponent(JSON.stringify({
    format: 'scarp-playground-workspace',
    version: 1,
    workspace: { entry: 'main.srp', files: { 'main.srp': main, ...files } },
    activeFile: 'main.srp',
  }));
}

async function openBudget(page: import('@playwright/test').Page) {
  await page.getByRole('button', { name: 'Commands', exact: true }).click();
  const palette = page.getByRole('dialog', { name: 'Command palette' });
  await palette.getByRole('combobox', { name: 'Search commands' })
    .fill('Workspace source budget');
  await palette.getByRole('option', { name: /Workspace source budget/ }).click();
  const panel = page.getByRole('region', { name: 'Workspace resource budget' });
  await expect(panel).toBeVisible();
  return panel;
}

test('workspace budget counts source bytes and imports without execution', async ({ page }) => {
  await page.goto(url('import "lib/helper.srp" as helper;\nprint("😀");\n', {
    'lib/helper.srp': 'pub bind value = 42;\n',
    'unused.srp': 'print(2);\n',
  }));
  const panel = await openBudget(page);
  await expect(panel.getByLabel('Source quota summary')).toContainText('3 / 12 source files');
  const table = panel.getByLabel('Per-file source resource metrics');
  await expect(table.getByRole('button', { name: 'Open budget file main.srp' })).toBeVisible();
  await expect(table.getByRole('button', { name: 'Open budget file lib/helper.srp' })).toBeVisible();
  await expect(table).toContainText('Not reached');

  await panel.getByLabel('Only reachable from entrypoint').check();
  await expect(table.getByRole('button', { name: 'Open budget file unused.srp' })).toHaveCount(0);
  await expect(table.getByRole('button', { name: 'Open budget file main.srp' })).toBeVisible();
});

test('long line locations navigate to Monaco while leaving code unchanged', async ({ page }) => {
  const long = 'print("' + 'x'.repeat(160) + '");';
  await page.goto(url('print(1);\n' + long + '\n'));
  const panel = await openBudget(page);
  await expect(panel.getByText('Lines exceeding 140 UTF-16 units')).toBeVisible();
  await panel.getByRole('button', { name: 'main.srp:2' }).click();
  await expect(page.locator('.monaco-editor textarea.inputarea')).toBeAttached();
  await panel.getByRole('button', { name: 'Close workspace budget' }).click();
  await page.getByRole('button', { name: 'Run code' }).click();
  await expect(page.locator('.stdout')).toContainText('x'.repeat(100), { timeout: 30_000 });
});

test('budget filters source file names and lets users sort by byte usage', async ({ page }) => {
  await page.goto(url('print(1);\n', { 'lib/a.srp': 'print(2);', 'lib/b.srp': 'print(3);' }));
  const panel = await openBudget(page);
  await panel.getByLabel('Find file').fill('LIB/');
  const table = panel.getByLabel('Per-file source resource metrics');
  await expect(table.getByRole('button', { name: 'Open budget file main.srp' })).toHaveCount(0);
  await expect(table.getByRole('button', { name: /Open budget file lib/ })).toHaveCount(2);
  await panel.getByLabel('Sort by').selectOption('path');
  await expect(table).toBeVisible();
});

test('workspace source budget is available through the mobile command palette', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto(url('print("hello");'));
  await page.keyboard.press('Control+Shift+P');
  const palette = page.getByRole('dialog', { name: 'Command palette' });
  await palette.getByRole('combobox', { name: 'Search commands' }).fill('Workspace source budget');
  await palette.getByRole('option', { name: /Workspace source budget/ }).click();
  await expect(page.getByRole('region', { name: 'Workspace resource budget' })).toBeVisible();
});
