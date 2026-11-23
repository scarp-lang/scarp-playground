import { expect, test } from '@playwright/test';

test('adds local Scarp modules and executes the imported source in real WASM', async ({ page }) => {
  const source = 'import "math.srp" as math;\nprint(math.twice(21));\n';
  await page.goto('./#code=' + encodeURIComponent(source));
  const importer = page.getByLabel('Choose .srp files to add');
  await importer.setInputFiles([{
    name: 'math.srp', mimeType: 'text/plain',
    buffer: Buffer.from('pub pure funcra twice(n: integer) -> integer { return n * 2; }\n'),
  }]);
  await expect(page.getByRole('tab', { name: /math.srp/ })).toBeVisible();
  await expect(page.locator('.notice')).toContainText('existing source files unchanged');
  await page.getByRole('tab', { name: /main.srp/ }).click();
  await page.getByRole('button', { name: 'Run code' }).click();
  await expect(page.locator('.stdout')).toHaveText('42\n', { timeout: 30_000 });

  await page.getByRole('button', { name: 'Undo bulk change' }).click();
  await expect(page.getByRole('tab', { name: /math.srp/ })).toHaveCount(0);
  await expect(page.locator('.monaco-editor .view-lines')).toContainText('math.twice(21)');
});

test('rejects any conflicting batch atomically and allows selecting the same files again', async ({ page }) => {
  await page.goto('./');
  const importer = page.getByLabel('Choose .srp files to add');
  const files = [
    { name: 'good.srp', mimeType: 'text/plain', buffer: Buffer.from('print(2);') },
    { name: 'main.srp', mimeType: 'text/plain', buffer: Buffer.from('print(3);') },
  ];
  await importer.setInputFiles(files);
  await expect(page.locator('.notice')).toContainText('main.srp already exists');
  await expect(page.getByRole('tab', { name: /good.srp/ })).toHaveCount(0);
  await importer.setInputFiles(files);
  await expect(page.locator('.notice')).toContainText('main.srp already exists');
  await expect(page.getByRole('tab', { name: /good.srp/ })).toHaveCount(0);
  await importer.setInputFiles([{ name: 'good.srp', mimeType: 'text/plain', buffer: files[0].buffer }]);
  await expect(page.getByRole('tab', { name: /good.srp/ })).toBeVisible();
});

test('rejects malformed UTF-8 without changing the active source', async ({ page }) => {
  await page.goto('./');
  const importer = page.getByLabel('Choose .srp files to add');
  await importer.setInputFiles([{
    name: 'broken.srp', mimeType: 'text/plain', buffer: Buffer.from([0xc3, 0x28]),
  }]);
  await expect(page.locator('.notice')).toContainText('not valid UTF-8');
  await expect(page.getByRole('tab', { name: /broken.srp/ })).toHaveCount(0);
  await expect(page.getByRole('tab', { name: /main.srp/ })).toHaveAttribute('aria-selected', 'true');
});
