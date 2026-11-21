import { expect, test } from '@playwright/test';

test('Ctrl+S opts into local source persistence and protects a same-tab reload', async ({ page }) => {
  await page.goto('./');
  const editor = page.locator('.monaco-editor textarea.inputarea');
  await expect(editor).toBeAttached({ timeout: 30_000 });
  await editor.focus();
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.insertText('print("Saved with Ctrl+S");');
  await expect(page.getByTestId('session-save-status')).toContainText('Unsaved work');
  await page.keyboard.press('ControlOrMeta+S');
  await expect(page.getByTestId('session-save-status')).toHaveText('Saved locally');
  await expect(page.getByRole('button', { name: 'Forget saved copy' })).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: 'Run code' }).click();
  await expect(page.locator('.stdout')).toHaveText('Saved with Ctrl+S\n', { timeout: 30_000 });
});

test('same-document share navigation preserves unsaved source when rejected', async ({ page }) => {
  await page.goto('./');
  const editor = page.locator('.monaco-editor textarea.inputarea');
  await expect(editor).toBeAttached({ timeout: 30_000 });
  await editor.focus();
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.insertText('print("Keep my draft");');
  await expect(page.getByTestId('session-save-status')).toContainText('Unsaved work');

  const dialogs: string[] = [];
  page.on('dialog', async dialog => {
    dialogs.push(dialog.message());
    await dialog.dismiss();
  });
  await page.evaluate(() => { window.location.hash = '#code=' + encodeURIComponent('print("Other");'); });
  await expect.poll(() => dialogs.length).toBe(1);
  await expect(page).toHaveURL(/\/scarp-playground\/$/);
  await page.getByRole('button', { name: 'Run code' }).click();
  await expect(page.locator('.stdout')).toHaveText('Keep my draft\n', { timeout: 30_000 });
  expect(dialogs[0]).toContain('Unsaved code or program input');
});

test('a pristine example switches share links without an unnecessary warning', async ({ page }) => {
  await page.goto('./');
  await expect(page.getByTestId('session-save-status'))
    .toContainText('Temporary, recoverable');
  await page.evaluate(() => { window.location.hash = '#code=' + encodeURIComponent('print(123);'); });
  await page.getByRole('button', { name: 'Run code' }).click();
  await expect(page.locator('.stdout')).toHaveText('123\n', { timeout: 30_000 });
  await expect(page.getByTestId('session-save-status'))
    .toContainText('Temporary, recoverable');
});

test('fresh edits in an autosaved project are flushed before unload', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: 'Save locally' }).click();
  const editor = page.locator('.monaco-editor textarea.inputarea');
  await expect(editor).toBeAttached({ timeout: 30_000 });
  await editor.focus();
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.insertText('print("Flush before unload");');
  // A synchronous beforeunload dispatch simulates a navigation before the
  // scheduled autosave. The source must already be in opted-in storage.
  const saved = await page.evaluate(() => {
    window.dispatchEvent(new Event('beforeunload', { cancelable: true }));
    return localStorage.getItem('scarp-playground-workspace-v1');
  });
  expect(saved).toContain('Flush before unload');
});

test('switching examples does not discard edits made before the autosave debounce', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: 'Save locally' }).click();
  const editor = page.locator('.monaco-editor textarea.inputarea');
  await expect(editor).toBeAttached({ timeout: 30_000 });
  await editor.focus();
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.insertText('print("Preserved during switch");');
  page.once('dialog', dialog => void dialog.accept());
  await page.getByRole('button', { name: /Root mean square/ }).click();
  await expect(page.getByRole('button', { name: 'Save locally' })).toBeVisible();
  // The saved source should be the latest edit, not the prior Hello sample.
  await page.reload();
  await page.getByRole('button', { name: 'Run code' }).click();
  await expect(page.locator('.stdout')).toHaveText(
    'Preserved during switch\n', { timeout: 30_000 },
  );
});
