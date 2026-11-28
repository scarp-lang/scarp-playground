import { expect, test } from '@playwright/test';

async function openTable(page: import('@playwright/test').Page) {
  await page.getByRole('button', { name: 'Commands', exact: true }).click();
  const palette = page.getByRole('dialog', { name: 'Command palette' });
  await palette.getByRole('combobox', { name: 'Search commands' })
    .fill('Inspect output table');
  await palette.getByRole('option', { name: /Inspect output table/ }).click();
  const panel = page.getByRole('region', { name: 'Structured output inspector' });
  await expect(panel).toBeVisible();
  return panel;
}

test('CSV output becomes a read-only filterable table after a real Scarp Run', async ({ page }) => {
  await page.goto('./#code=' + encodeURIComponent(
    'print("name,score");\nprint("Ada,42");\nprint("Grace,99");\n',
  ));
  await page.getByRole('button', { name: 'Run code' }).click();
  await expect(page.locator('.stdout')).toContainText('Grace,99', { timeout: 30_000 });
  const panel = await openTable(page);
  await panel.getByRole('button', { name: 'Inspect captured output' }).click();
  await expect(panel.getByLabel('Output table summary')).toContainText('2 parsed rows');
  const table = panel.getByLabel('Structured output table');
  await expect(table.getByRole('columnheader', { name: 'name' })).toBeVisible();
  await expect(table.getByRole('columnheader', { name: 'score' })).toBeVisible();
  await expect(table.getByRole('cell', { name: 'Grace' })).toBeVisible();

  await panel.getByLabel('Filter table cells').fill('Ada');
  await expect(panel).toContainText('1 matching row(s)');
  await expect(table.getByRole('cell', { name: 'Ada' })).toBeVisible();
  await expect(table.getByRole('cell', { name: 'Grace' })).toHaveCount(0);
  await panel.getByRole('button', { name: 'Close structured output' }).click();
  await expect(page.locator('.stdout')).toContainText('Grace,99');
});

test('unstructured program output has a useful non-destructive parse error', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: 'Run code' }).click();
  await expect(page.locator('.stdout')).toContainText('Hello from Scarp!', { timeout: 30_000 });
  const panel = await openTable(page);
  await panel.getByRole('button', { name: 'Inspect captured output' }).click();
  await expect(panel.getByRole('alert')).toContainText('No recognized JSON');
  await expect(page.locator('.stdout')).toHaveText('Hello from Scarp!\n');
});

test('the table does not interpret formula-like output and never exports it implicitly', async ({ page }) => {
  await page.goto('./#code=' + encodeURIComponent(
    'print("item,value");\nprint("formula,=1+2");\n',
  ));
  await page.getByRole('button', { name: 'Run code' }).click();
  await expect(page.locator('.stdout')).toContainText('formula,=1+2', { timeout: 30_000 });
  const panel = await openTable(page);
  await panel.getByRole('button', { name: 'Inspect captured output' }).click();
  await expect(panel.getByLabel('Structured output table')
    .getByRole('cell', { name: '=1+2' })).toBeVisible();
  const state = await page.evaluate(() => ({
    hash: window.location.hash,
    local: JSON.stringify(Object.entries(window.localStorage)),
  }));
  expect(JSON.stringify(state)).not.toContain('formula,=1+2');
});

test('the output inspector is reachable through keyboard commands on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('./#code=' + encodeURIComponent('print("key,value");\nprint("a,1");\n'));
  await page.getByRole('button', { name: 'Run code' }).click();
  await expect(page.locator('.stdout')).toContainText('a,1', { timeout: 30_000 });
  await page.keyboard.press('Control+Shift+P');
  const palette = page.getByRole('dialog', { name: 'Command palette' });
  await palette.getByRole('combobox', { name: 'Search commands' }).fill('Inspect output table');
  await palette.getByRole('option', { name: /Inspect output table/ }).click();
  await expect(page.getByRole('region', { name: 'Structured output inspector' })).toBeVisible();
});
