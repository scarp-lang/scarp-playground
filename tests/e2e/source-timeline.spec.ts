import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { loadExample } from './support/example-switch';

test('source timeline captures named versions, compares and restores with exact undo', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: 'Source timeline' }).click();
  const panel = page.getByRole('region', { name: 'Source snapshot timeline' });
  await expect(panel).toBeVisible();
  await panel.getByLabel('New snapshot name').fill('Initial Scarp');
  await panel.getByRole('button', { name: 'Capture current source' }).click();
  await expect(panel.getByText('Initial Scarp', { exact: true })).toBeVisible();
  await panel.getByRole('button', { name: 'Close source timeline' }).click();

  await loadExample(page, /Import a module/);
  await page.getByRole('button', { name: 'Source timeline' }).click();
  await expect(panel).toContainText('changed source file(s)');
  await expect(panel.getByLabel('Compared source files')).toBeVisible();
  await expect(panel.getByRole('button', { name: 'Restore selected snapshot' })).toBeEnabled();
  page.once('dialog', dialog => void dialog.accept());
  await panel.getByRole('button', { name: 'Restore selected snapshot' }).click();
  await expect(panel).not.toBeVisible();
  await page.getByRole('button', { name: 'Run code' }).click();
  await expect(page.locator('.stdout')).toHaveText('Hello from Scarp!\n', { timeout: 30_000 });
  await page.getByRole('button', { name: 'Undo bulk change' }).click();
  await expect(page.getByRole('tab', { name: /math.srp/ })).toBeVisible();
});

test('snapshot timeline can compare two named versions without losing existing captures', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: 'Source timeline' }).click();
  const panel = page.getByRole('region', { name: 'Source snapshot timeline' });
  await panel.getByLabel('New snapshot name').fill('Before');
  await panel.getByRole('button', { name: 'Capture current source' }).click();
  await panel.getByRole('button', { name: 'Close source timeline' }).click();

  await loadExample(page, /Import a module/);
  await page.getByRole('button', { name: 'Source timeline' }).click();
  await panel.getByLabel('New snapshot name').fill('After');
  await panel.getByRole('button', { name: 'Capture current source' }).click();
  await panel.getByLabel('Snapshot to inspect').selectOption('1');
  await panel.getByLabel('Compare with').selectOption('2');
  await expect(panel.getByText(/changed source file\(s\)/)).toBeVisible();

  await panel.getByRole('button', { name: 'Rename snapshot' }).click();
  await panel.getByLabel('New name for Before').fill('Reviewed baseline');
  await panel.getByRole('button', { name: 'Save snapshot name' }).click();
  await expect(panel).toContainText('Reviewed baseline');
  page.once('dialog', dialog => void dialog.accept());
  await panel.getByRole('button', { name: 'Discard selected' }).click();
  await expect(panel.getByLabel('Timeline storage summary')).toContainText('1/8 snapshots');
});

test('downloaded source timeline manifest contains paths and sizes but no code', async ({ page }) => {
  await page.goto('./#code=' + encodeURIComponent('print("PRIVATE_SAMPLE_BODY");\n'));
  await page.getByRole('button', { name: 'Source timeline' }).click();
  const panel = page.getByRole('region', { name: 'Source snapshot timeline' });
  await panel.getByRole('button', { name: 'Capture current source' }).click();
  const downloadPromise = page.waitForEvent('download');
  await panel.getByRole('button', { name: 'Download source-free manifest' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('scarp-source-timeline-manifest.json');
  const file = await download.path();
  expect(file).toBeTruthy();
  const contents = await readFile(file!, 'utf8');
  const envelope = JSON.parse(contents);
  expect(envelope.count).toBe(1);
  expect(envelope.items[0].files).toEqual(['main.srp']);
  expect(contents).not.toContain('PRIVATE_SAMPLE_BODY');
  expect(contents).not.toContain('print(');
  await page.reload();
  await page.getByRole('button', { name: 'Source timeline' }).click();
  await expect(panel.getByText('No source snapshots captured yet.')).toBeVisible();
});

test('source timeline is reachable from the keyboard command palette', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('./');
  await page.keyboard.press('Control+Shift+P');
  const palette = page.getByRole('dialog', { name: 'Command palette' });
  await palette.getByRole('combobox', { name: 'Search commands' }).fill('Source snapshot timeline');
  await palette.getByRole('option', { name: /Source snapshot timeline/ }).click();
  await expect(page.getByRole('region', { name: 'Source snapshot timeline' })).toBeVisible();
});
