import { expect, test } from '@playwright/test';

async function openComparison(page: import('@playwright/test').Page) {
  await page.getByRole('button', { name: 'Commands', exact: true }).click();
  const palette = page.getByRole('dialog', { name: 'Command palette' });
  await palette.getByRole('combobox', { name: 'Search commands' })
    .fill('Compare Run output');
  await palette.getByRole('option', { name: /Compare Run output/ }).click();
  const panel = page.getByRole('region', { name: 'Compare captured program output' });
  await expect(panel).toBeVisible();
  return panel;
}

test('pin a Run, execute changed source, then compare the two outputs', async ({ page }) => {
  await page.goto('./#code=' + encodeURIComponent('print("baseline");\n'));
  await page.getByRole('button', { name: 'Run code' }).click();
  await expect(page.locator('.stdout')).toHaveText('baseline\n', { timeout: 30_000 });
  const panel = await openComparison(page);
  page.once('dialog', dialog => void dialog.accept());
  await panel.getByRole('button', { name: 'Pin current Run output' }).click();
  await expect(panel.getByLabel('Run comparison status')).toContainText('Pinned baseline');

  await page.getByRole('button', { name: 'Close output comparison' }).click();
  // Loading a new example is an explicit user action; compare its result
  // with the previously pinned output without persisting either output.
  await page.getByLabel('Find an example').fill('Variables');
  await page.getByLabel('Choose an example').selectOption({ index: 1 });
  await page.getByRole('button', { name: 'Load example' }).click();
  await page.getByRole('button', { name: 'Run code' }).click();
  await expect(page.locator('.stdout')).not.toHaveText('baseline\n', { timeout: 30_000 });

  const second = await openComparison(page);
  await second.getByRole('button', { name: 'Compare output against baseline' }).click();
  await expect(second.getByLabel('Output baseline comparison summary')).toContainText('modified lines');
  await expect(second.getByLabel('Captured output differences')).toBeVisible();
});

test('baseline capture is explicit and can be cleared from the active tab', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: 'Run code' }).click();
  await expect(page.locator('.stdout')).toContainText('Hello', { timeout: 30_000 });
  const panel = await openComparison(page);
  await expect(panel.getByLabel('Run comparison status')).toContainText('No output baseline pinned');
  page.once('dialog', dialog => void dialog.accept());
  await panel.getByRole('button', { name: 'Pin current Run output' }).click();
  await expect(panel.getByLabel('Run comparison status')).toContainText('Pinned Run');
  page.once('dialog', dialog => void dialog.accept());
  await panel.getByRole('button', { name: 'Clear pinned baseline' }).click();
  await expect(panel.getByLabel('Run comparison status')).toContainText('No output baseline pinned');
});

test('a pinned output baseline never persists through a page reload', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: 'Run code' }).click();
  await expect(page.locator('.stdout')).toContainText('Hello', { timeout: 30_000 });
  const panel = await openComparison(page);
  page.once('dialog', dialog => void dialog.accept());
  await panel.getByRole('button', { name: 'Pin current Run output' }).click();
  await page.reload();
  const again = await openComparison(page);
  await expect(again.getByLabel('Run comparison status')).toContainText('No output baseline pinned');
});
