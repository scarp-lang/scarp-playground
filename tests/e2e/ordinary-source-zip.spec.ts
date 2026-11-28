import { expect, test } from '@playwright/test';
import { ordinaryZip } from '../support/ordinary-zip';

test('imports an ordinary stored ZIP with directory metadata and ignored files', async ({ page }) => {
  await page.goto('./');
  const zip = ordinaryZip([
    { name: 'src/', source: '' },
    { name: 'src/main.srp', source: 'import "../lib/math.srp" as math;\nprint(math.twice(21));' },
    { name: 'lib/math.srp', source: 'pub pure funcra twice(n: integer) -> integer { return n * 2; }' },
    { name: 'README.md', source: 'ignored' },
  ], 'ordinary ZIP');
  await page.getByLabel('Choose source ZIP to import').setInputFiles({ name: 'project.zip', mimeType: 'application/zip', buffer: zip });
  const preview = page.getByRole('region', { name: 'Source ZIP preview' });
  await expect(preview).toContainText('2 .srp files');
  await expect(preview).toContainText('1 non-source files ignored');
  await expect(preview.getByLabel('Entrypoint')).toHaveValue('src/main.srp');
  page.once('dialog', dialog => dialog.accept());
  await preview.getByRole('button', { name: 'Replace with source ZIP' }).click();
  await page.getByRole('button', { name: 'Run code' }).click();
  await expect(page.locator('.stdout')).toHaveText('42\n', { timeout: 30_000 });
});

test('deflated sources use native decompression where supported and never silently fail', async ({ page }) => {
  await page.goto('./');
  const supported = await page.evaluate(() => {
    try { return !!new DecompressionStream('deflate-raw'); } catch { return false; }
  });
  const zip = ordinaryZip([{ name: 'main.srp', source: 'print("compressed");', method: 8, descriptor: 'signed' }]);
  await page.getByLabel('Choose source ZIP to import').setInputFiles({ name: 'compressed.zip', mimeType: 'application/zip', buffer: zip });
  const preview = page.getByRole('region', { name: 'Source ZIP preview' });
  if (!supported) {
    await expect(page.locator('.notice')).toContainText('cannot read');
    await expect(preview).toHaveCount(0);
    return;
  }
  await expect(preview).toBeVisible();
  page.once('dialog', dialog => dialog.accept());
  await preview.getByRole('button', { name: 'Replace with source ZIP' }).click();
  await page.getByRole('button', { name: 'Run code' }).click();
  await expect(page.locator('.stdout')).toHaveText('compressed\n', { timeout: 30_000 });
});

test('unsafe ZIP paths are rejected before the replacement preview', async ({ page }) => {
  await page.goto('./');
  const zip = ordinaryZip([{ name: 'main.srp', source: 'print(0);' }, { name: '../outside.srp', source: 'print(1);' }]);
  await page.getByLabel('Choose source ZIP to import').setInputFiles({ name: 'unsafe.zip', mimeType: 'application/zip', buffer: zip });
  await expect(page.locator('.notice')).toContainText('unsafe relative path');
  await expect(page.getByRole('region', { name: 'Source ZIP preview' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Run code' }).click();
  await expect(page.locator('.stdout')).toHaveText('Hello from Scarp!\n', { timeout: 30_000 });
});
