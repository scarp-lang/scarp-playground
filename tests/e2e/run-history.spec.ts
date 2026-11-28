import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';

test('run history records completed browser operations without recording source or program input', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: 'Run history', exact: true }).click();
  const panel = page.getByRole('region', { name: 'Browser run history' });
  await expect(panel).toBeVisible();
  await expect(panel.getByText('No completed operations yet. Run, Check or Verify code to record timing metadata.'))
    .toBeVisible();
  await expect(panel.getByRole('button', { name: 'Download source-free JSON report' })).toBeDisabled();
  await panel.getByRole('button', { name: 'Close run history' }).click();

  await page.getByRole('button', { name: 'Verify code' }).click();
  await expect(page.locator('.terminal-output')).toContainText(
    'Static verification passed.', { timeout: 30_000 },
  );
  await page.getByRole('button', { name: 'Run code' }).click();
  await expect(page.locator('.stdout')).toHaveText('Hello from Scarp!\n', { timeout: 30_000 });

  await page.getByRole('button', { name: 'Run history', exact: true }).click();
  await expect(panel).toContainText('Completed');
  await expect(panel.getByRole('row')).toHaveCount(3);
  await panel.getByLabel('Operation').selectOption('verify');
  await expect(panel.getByRole('row')).toHaveCount(2);
  await panel.getByLabel('Operation').selectOption('run');
  await expect(panel.getByRole('row')).toHaveCount(2);

  const downloadPromise = page.waitForEvent('download');
  await panel.getByRole('button', { name: 'Download source-free JSON report' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('scarp-playground-run-history.json');
  const path = await download.path();
  expect(path).toBeTruthy();
  const content = await readFile(path!, 'utf8');
  const envelope = JSON.parse(content) as {
    format: string; version: number;
    entries: Array<{ mode: string; outcome: string; elapsedMs: number }>;
  };
  expect(envelope.format).toBe('scarp-playground-run-history');
  expect(envelope.version).toBe(1);
  expect(envelope.entries.map(e => e.mode)).toEqual(['verify', 'run']);
  expect(content).not.toContain('Hello from Scarp!');
  expect(content).not.toContain('print(');
});

test('run history is ephemeral and clearing it is explicit', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: 'Verify code' }).click();
  await expect(page.locator('.terminal-output')).toContainText(
    'Static verification passed.', { timeout: 30_000 },
  );
  await page.getByRole('button', { name: 'Run history', exact: true }).click();
  const panel = page.getByRole('region', { name: 'Browser run history' });
  await expect(panel.getByRole('row')).toHaveCount(2);
  page.once('dialog', dialog => void dialog.accept());
  await panel.getByRole('button', { name: 'Clear run history' }).click();
  await expect(panel.getByText('No completed operations yet. Run, Check or Verify code to record timing metadata.'))
    .toBeVisible();
  await panel.getByRole('button', { name: 'Close run history' }).click();
  await page.reload();
  await page.getByRole('button', { name: 'Run history', exact: true }).click();
  await expect(panel.getByText('No completed operations yet. Run, Check or Verify code to record timing metadata.'))
    .toBeVisible();
});

test('command palette exposes the session run history tool', async ({ page }) => {
  await page.goto('./');
  await page.keyboard.press('Control+Shift+P');
  const palette = page.getByRole('dialog', { name: 'Command palette' });
  await expect(palette).toBeVisible();
  await palette.getByRole('combobox', { name: 'Search commands' }).fill('Browser run history');
  await palette.getByRole('option', { name: /Browser run history/ }).click();
  await expect(page.getByRole('region', { name: 'Browser run history' })).toBeVisible();
});
