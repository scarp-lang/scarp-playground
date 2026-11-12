import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';

test('downloads an exact UTF-8 .srp source file without affecting the virtual project', async ({ page }) => {
  const source = '// नमस्ते 😀\r\nprint("hello");\n';
  await page.goto('./#code=' + encodeURIComponent(source));
  const editorFooter = page.locator('.editor-footer');
  await expect(editorFooter).toContainText('main.srp · 3 lines · ' +
    new TextEncoder().encode(source).byteLength + ' bytes');

  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download .srp' }).click();
  const download = await pending;
  expect(download.suggestedFilename()).toBe('main.srp');
  expect(await readFile(await download.path(), 'utf8')).toBe(source);
  await expect(page.locator('.notice')).toContainText('No source was uploaded');
  await expect(page.locator('.monaco-editor .view-lines')).toContainText('print("hello")');
  await page.getByRole('button', { name: 'Run code' }).click();
  await expect(page.locator('.stdout')).toHaveText('hello\n', { timeout: 30_000 });
});

test('downloads the current imported module, not the entry file or entire JSON workspace', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: /Import a module/ }).click();
  await page.getByRole('tab', { name: /math.srp/ }).click();
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download .srp' }).click();
  const download = await pending;
  expect(download.suggestedFilename()).toBe('math.srp');
  expect(await readFile(await download.path(), 'utf8')).toBe(
    'pub pure funcra twice(n: integer) -> integer { return n * 2; }\n',
  );
  await expect(page.getByRole('tab', { name: /math.srp/ }))
    .toHaveAttribute('aria-selected', 'true');
  await page.getByRole('tab', { name: /main.srp/ }).click();
  await expect(page.locator('.monaco-editor .view-lines')).toContainText('math.twice(21)');
});

test('active file statistics track Unicode Monaco source editing in real time', async ({ page }) => {
  await page.goto('./');
  const editor = page.locator('.monaco-editor textarea.inputarea');
  await expect(editor).toBeAttached();
  await editor.focus();
  await page.keyboard.press('ControlOrMeta+A');
  const source = 'print("😀");\nprint("π");';
  await page.keyboard.insertText(source);
  const bytes = new TextEncoder().encode(source).byteLength;
  await expect(page.locator('.editor-footer')).toContainText(
    'main.srp · 2 lines · ' + bytes + ' bytes',
  );
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download .srp' }).click();
  const download = await pending;
  expect(await readFile(await download.path(), 'utf8')).toBe(source);
});

test('copy current source uses browser clipboard only when permission is available', async ({ page, context, browserName }) => {
  test.skip(browserName !== 'chromium', 'Clipboard permissions are browser-engine-specific.');
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const source = 'print("copied locally");';
  await page.goto('./#code=' + encodeURIComponent(source));
  await page.getByRole('button', { name: 'Copy source' }).click();
  await expect(page.locator('.notice')).toContainText('Copied main.srp to the clipboard');
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(source);
});
