import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { replaceExampleAfterEdit } from './support/example-switch';

test('SHA-256 source integrity manifest matches exact current files', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: 'Source integrity' }).click();
  const panel = page.getByRole('region', { name: 'Workspace source integrity' });
  await expect(panel).toBeVisible();
  await panel.getByRole('button', { name: 'Generate manifest from current workspace' }).click();
  await expect(panel.getByLabel('Selected source integrity manifest'))
    .toContainText('Workspace SHA-256');
  await expect(panel.getByLabel('Selected source integrity manifest'))
    .toContainText(/[0-9a-f]{64}/);
  await panel.getByRole('button', { name: 'Compare current sources' }).click();
  await expect(panel.getByLabel('Source integrity comparison')).toContainText('Exact match');
  await expect(panel.getByLabel('Source file comparison summary')).toContainText('1 matching');
});

test('integrity manifest detects source replacement and supports exact local download', async ({ page }) => {
  await page.goto('./#code=' + encodeURIComponent('print("UNIQUE_PRIVATE_SOURCE");\n'));
  await page.getByRole('button', { name: 'Source integrity' }).click();
  const panel = page.getByRole('region', { name: 'Workspace source integrity' });
  await panel.getByRole('button', { name: 'Generate manifest from current workspace' }).click();
  const downloadPromise = page.waitForEvent('download');
  await panel.getByRole('button', { name: 'Download manifest' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('scarp-source-integrity.json');
  const file = await download.path();
  expect(file).toBeTruthy();
  const content = await readFile(file!, 'utf8');
  const snapshot = JSON.parse(content);
  expect(snapshot.files).toHaveLength(1);
  expect(content).not.toContain('UNIQUE_PRIVATE_SOURCE');
  expect(content).not.toContain('print(');

  await panel.getByRole('button', { name: 'Close source integrity' }).click();
  await replaceExampleAfterEdit(page, /Import a module/);
  await expect(page.getByRole('tab', { name: /math.srp/ })).toBeVisible();
  await page.getByRole('button', { name: 'Source integrity' }).click();
  await panel.getByRole('button', { name: 'Compare current sources' }).click();
  await expect(panel.getByLabel('Source integrity comparison')).toContainText('Differences found');
  await expect(panel.getByLabel('Source file comparison summary')).toContainText('1 added');
  await expect(panel.getByLabel('Compared integrity files')).toContainText('math.srp');
});

test('imported manifest compares fingerprints without restoring or executing source', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: 'Source integrity' }).click();
  const panel = page.getByRole('region', { name: 'Workspace source integrity' });
  await panel.getByRole('button', { name: 'Generate manifest from current workspace' }).click();
  const downloadPromise = page.waitForEvent('download');
  await panel.getByRole('button', { name: 'Download manifest' }).click();
  const downloaded = await downloadPromise;
  const file = await downloaded.path();
  const content = await readFile(file!, 'utf8');
  await panel.getByRole('button', { name: 'Discard manifest' }).click();
  await expect(panel.getByText('No integrity baseline selected. Generate or import one above.'))
    .toBeVisible();
  await panel.getByLabel('Import manifest JSON').setInputFiles({
    name: 'baseline.json', mimeType: 'application/json', buffer: Buffer.from(content, 'utf8'),
  });
  await expect(panel.getByLabel('Selected source integrity manifest')).toContainText('SHA-256');
  await panel.getByRole('button', { name: 'Compare current sources' }).click();
  await expect(panel.getByLabel('Source integrity comparison')).toContainText('Exact match');
});

test('rejects edited manifest metadata with an inconsistent SHA-256 root', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: 'Source integrity' }).click();
  const panel = page.getByRole('region', { name: 'Workspace source integrity' });
  await panel.getByLabel('Import manifest JSON').setInputFiles({
    name: 'forged.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({
      format: 'scarp-playground-source-integrity', version: 1, algorithm: 'SHA-256',
      entry: 'main.srp', files: [{
        path: 'main.srp', bytes: 1, sha256: '0'.repeat(64),
      }], workspaceSha256: '0'.repeat(64),
    }), 'utf8'),
  });
  await expect(panel).toContainText('Manifest metadata fingerprint mismatch');
  await expect(panel.getByLabel('Selected source integrity manifest')).toHaveCount(0);
});

test('source integrity is available through command palette and on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('./');
  await page.keyboard.press('Control+Shift+P');
  const palette = page.getByRole('dialog', { name: 'Command palette' });
  await palette.getByRole('combobox', { name: 'Search commands' }).fill('Source integrity manifest');
  await palette.getByRole('option', { name: /Source integrity manifest/ }).click();
  await expect(page.getByRole('region', { name: 'Workspace source integrity' })).toBeVisible();
});
