import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';

// Both use the real compiler index, not the Run/Check interpreter entrypoints.
async function putCursorOnUnknownIdentifier(page: import('@playwright/test').Page) {
  await page.goto('./#code=' + encodeURIComponent('print(unknown_symbol);'));
  const editor = page.locator('.monaco-editor textarea.inputarea');
  await expect(editor).toBeAttached();
  await editor.focus();
  await page.keyboard.press('ControlOrMeta+End');
  for (let i = 0; i < 3; i += 1) await page.keyboard.press('ArrowLeft');
}

test('Go to Definition diagnostics do not masquerade as execution errors', async ({ page }) => {
  await putCursorOnUnknownIdentifier(page);
  await page.getByRole('button', { name: 'Go to definition' }).click();
  await expect(page.locator('.error-title')).toContainText('E0010', { timeout: 30_000 });
  await expect(page.locator('.console-subtitle')).toHaveText('Go to Definition');

  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download result' }).click();
  const download = await pending;
  const content = await readFile(await download.path(), 'utf8');
  expect(content).toContain('Go to Definition failed');
  expect(content).not.toContain('Execution failed');
  expect(content).toContain('E0010');
  await expect(page.locator('.stdout')).toHaveCount(0);
});

test('Find References diagnostics are attributed to the compiler index', async ({ page }) => {
  await putCursorOnUnknownIdentifier(page);
  await page.getByRole('button', { name: 'Find references' }).click();
  await expect(page.locator('.error-title')).toContainText('E0010', { timeout: 30_000 });
  await expect(page.locator('.console-subtitle')).toHaveText('Find References');
  await expect(page.locator('.stdout')).toHaveCount(0);
});


test('Rename preview diagnostic is labelled without executing the source', async ({ page }) => {
  await page.goto('./#code=' + encodeURIComponent(
    'bind target = 1;\nprint(target);\nprint(unknown_symbol);',
  ));
  const editor = page.locator('.monaco-editor textarea.inputarea');
  await expect(editor).toBeAttached();
  await editor.focus();
  await page.keyboard.press('ControlOrMeta+Home');
  for (let i = 0; i < 8; i += 1) await page.keyboard.press('ArrowRight');

  await page.getByRole('button', { name: 'Rename symbol' }).click();
  await page.getByRole('textbox', { name: 'New Scarp identifier' }).fill('updated');
  await page.getByRole('button', { name: 'Preview rename' }).click();

  await expect(page.locator('.error-title')).toContainText('E0010', { timeout: 30_000 });
  await expect(page.locator('.console-subtitle')).toHaveText('Rename preview');
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download result' }).click();
  const download = await pending;
  const content = await readFile(await download.path(), 'utf8');
  expect(content).toContain('Rename preview failed');
  expect(content).not.toContain('Execution failed');
  await expect(page.locator('.stdout')).toHaveCount(0);
});
