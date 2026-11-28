import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';

test('round-trips a real browser ZIP download with entry review and saved session protection', async ({ page }) => {
  const payload = { format: 'scarp-playground-workspace', version: 1,
    workspace: { entry: 'src/main.srp', files: {
      'src/main.srp': 'import "../lib/math.srp" as math;\nprint(math.twice(21));',
      'lib/math.srp': 'pub pure funcra twice(n: integer) -> integer { return n * 2; }',
      'alternative.srp': 'print("alternative");',
    } }, activeFile: 'src/main.srp' };
  await page.goto('./#project=' + encodeURIComponent(JSON.stringify(payload)));
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download sources ZIP' }).click();
  const download = await pending;
  const zip = await readFile(await download.path());
  await page.goto('./');
  await page.getByRole('button', { name: 'Save locally' }).click();
  await page.getByRole('textbox', { name: /program input/i }).fill('old input');
  const picker = page.getByLabel('Choose source ZIP to import');
  await picker.setInputFiles({ name: 'scarp-sources.zip', mimeType: 'application/zip', buffer: zip });
  const preview = page.getByRole('region', { name: 'Source ZIP preview' });
  await expect(preview).toContainText('3 .srp files');
  await expect(preview.getByLabel('Entrypoint')).toHaveValue('src/main.srp');
  await expect(page.getByRole('tab', { name: /src\/main.srp/ })).toHaveCount(0);
  const dismissed = page.waitForEvent('dialog').then(dialog => dialog.dismiss());
  await preview.getByRole('button', { name: 'Replace with source ZIP' }).click();
  await dismissed;
  await expect(preview).toBeVisible();
  const accepted = page.waitForEvent('dialog').then(dialog => dialog.accept());
  await preview.getByRole('button', { name: 'Replace with source ZIP' }).click();
  await accepted;
  await expect(page.getByRole('tab', { name: /src\/main.srp/ })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('textbox', { name: /program input/i })).toHaveValue('');
  await page.getByRole('button', { name: 'Run code' }).click();
  await expect(page.locator('.stdout')).toHaveText('42\n', { timeout: 30_000 });
  await page.reload();
  await page.getByRole('button', { name: 'Run code' }).click();
  await expect(page.locator('.stdout')).toHaveText('Hello from Scarp!\n', { timeout: 30_000 });
});

test('rejects corrupt and oversized archives without changing active source', async ({ page }) => {
  await page.goto('./');
  const picker = page.getByLabel('Choose source ZIP to import');
  await picker.setInputFiles({ name: 'broken.zip', mimeType: 'application/zip', buffer: Buffer.from('invalid') });
  await expect(page.locator('.notice')).toContainText('ZIP is empty, invalid');
  await expect(page.getByRole('region', { name: 'Source ZIP preview' })).toHaveCount(0);
  await picker.setInputFiles({ name: 'large.zip', mimeType: 'application/zip', buffer: Buffer.alloc(160 * 1024) });
  await expect(page.locator('.notice')).toContainText('exceeds the source archive size limit');
  await page.getByRole('button', { name: 'Run code' }).click();
  await expect(page.locator('.stdout')).toHaveText('Hello from Scarp!\n', { timeout: 30_000 });
});
