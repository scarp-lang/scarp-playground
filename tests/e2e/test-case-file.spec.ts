import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';

const input = { format: 'scarp-playground-test-cases', version: 1, cases: [
  { name: 'Echo case', stdin: 'hello\n', allowPrompts: false,
    expected: { kind: 'output', stdout: 'hello\n', stderr: '' } },
] };

test('imports reviewed definitions, executes manually, and explicitly exports case-only JSON', async ({ page }) => {
  await page.goto('./#code=' + encodeURIComponent('print(read_line());'));
  await page.getByRole('textbox', { name: /program input/i }).fill('ordinary input');
  await page.getByRole('button', { name: 'Test cases', exact: true }).click();
  const panel = page.getByRole('region', { name: 'Program test cases' });
  await panel.getByLabel('Case name').fill('Existing');
  const picker = panel.getByLabel('Choose test case JSON');
  await picker.setInputFiles({ name: 'cases.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(input)) });
  const preview = panel.getByLabel('Imported test case preview');
  await expect(preview).toContainText('Echo case');
  await expect(panel.getByLabel('Case name')).toHaveValue('Existing');
  await expect(panel.getByRole('region', { name: 'Test case results' })).toHaveCount(0);
  await preview.getByRole('button', { name: 'Replace test cases' }).click();
  await expect(panel.getByLabel('Case name')).toHaveValue('Echo case');
  await expect(panel.getByLabel('Test stdin')).toHaveValue('hello\n');
  await expect(page.getByRole('textbox', { name: /program input/i })).toHaveValue('ordinary input');
  await panel.getByRole('button', { name: 'Run test cases' }).click();
  await expect(panel.getByRole('region', { name: 'Test case results' })).toContainText('1 passed', { timeout: 30_000 });
  const pending = page.waitForEvent('download');
  const accepted = page.waitForEvent('dialog').then(dialog => dialog.accept());
  await panel.getByRole('button', { name: 'Export test cases' }).click();
  await accepted;
  const download = await pending;
  expect(download.suggestedFilename()).toBe('scarp-test-cases.json');
  expect(JSON.parse(await readFile(await download.path(), 'utf8'))).toEqual(input);
});

test('rejects malformed files and stale previews without changing definitions', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: 'Test cases', exact: true }).click();
  const panel = page.getByRole('region', { name: 'Program test cases' });
  const picker = panel.getByLabel('Choose test case JSON');
  await picker.setInputFiles({ name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('{') });
  await expect(panel).toContainText('not valid JSON');
  await expect(panel.getByLabel('Case name')).toHaveValue('Case 1');
  await picker.setInputFiles({ name: 'cases.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(input)) });
  const preview = panel.getByLabel('Imported test case preview');
  await expect(preview).toBeVisible();
  await panel.getByLabel('Case name').fill('Changed while reviewing');
  await expect(preview).toContainText('The case list changed');
  await expect(preview.getByRole('button', { name: 'Replace test cases' })).toHaveCount(0);
  await preview.getByRole('button', { name: 'Cancel case import' }).click();
  await expect(panel.getByLabel('Case name')).toHaveValue('Changed while reviewing');
});
