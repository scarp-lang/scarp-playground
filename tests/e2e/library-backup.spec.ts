import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';

const snapshot = (name: string, source: string) => ({ name, modified: 1, activeFile: 'main.srp',
  workspace: { entry: 'main.srp', files: { 'main.srp': source } } });
const backup = (...projects: ReturnType<typeof snapshot>[]) => ({
  format: 'scarp-playground-library', version: 1, projects,
});

test('downloads a named-only backup and restores selected names with conflict review', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: 'Project library', exact: true }).click();
  const library = page.getByRole('region', { name: 'Local project library' });
  await library.getByLabel('New snapshot name').fill('Keep');
  await library.getByRole('button', { name: 'Save named snapshot' }).click();
  await expect(library).toContainText('Saved source snapshot "Keep"');
  const controls = library.getByRole('region', { name: 'Library backup' });
  const download = page.waitForEvent('download');
  page.once('dialog', dialog => dialog.accept());
  await controls.getByRole('button', { name: 'Download library backup' }).click();
  const file = await download;
  const raw = JSON.parse(await readFile(await file.path(), 'utf8'));
  expect(raw.format).toBe('scarp-playground-library');
  expect(raw.projects.map((item: { name: string }) => item.name)).toEqual(['Keep']);
  const input = backup(snapshot('keep', 'print(42);'), snapshot('New', 'print(17);'));
  await controls.getByLabel('Choose library backup JSON').setInputFiles({ name: 'backup.json', mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(input)) });
  const review = controls.getByRole('region', { name: 'Library restore preview' });
  await expect(review.getByLabel('Action for keep')).toHaveValue('skip');
  await review.getByLabel('Action for keep').selectOption('rename');
  await review.getByLabel('New name for keep').fill('Copy');
  await expect(review).toContainText('3 total snapshots after restore');
  page.once('dialog', dialog => dialog.accept());
  await review.getByRole('button', { name: 'Apply library restore' }).click();
  await expect(library).toContainText('3 / 6 snapshots');
  await expect(library.getByRole('button', { name: /Copy.*1 files/ })).toBeVisible();
  await expect(page.locator('.monaco-editor .view-lines')).toContainText('Hello from Scarp!');
});

test('rejects stale cross-tab backup restoration without losing a newer project', async ({ page, context }) => {
  await page.goto('./');
  const other = await context.newPage();
  await other.goto('./');
  for (const tab of [page, other]) {
    await tab.getByRole('button', { name: 'Project library', exact: true }).click();
    await expect(tab.getByLabel('New snapshot name')).toBeVisible();
  }
  const controls = page.getByRole('region', { name: 'Library backup' });
  await controls.getByLabel('Choose library backup JSON').setInputFiles({ name: 'backup.json', mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(backup(snapshot('Incoming', 'print(2);')))) });
  const review = controls.getByRole('region', { name: 'Library restore preview' });
  await expect(review).toContainText('1 total snapshots after restore');
  await other.getByLabel('New snapshot name').fill('Newer');
  await other.getByRole('button', { name: 'Save named snapshot' }).click();
  await expect(other.getByRole('region', { name: 'Local project library' })).toContainText('Saved source snapshot "Newer"');
  page.once('dialog', dialog => dialog.accept());
  await review.getByRole('button', { name: 'Apply library restore' }).click();
  await expect(controls).toContainText('Saved projects changed in another tab');
  await page.getByRole('button', { name: 'Refresh library' }).click();
  await expect(page.getByRole('region', { name: 'Local project library' })).toContainText('1 / 6 snapshots');
  await expect(page.getByRole('button', { name: /Newer.*1 files/ })).toBeVisible();
  await other.close();
});
