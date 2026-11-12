import { expect, test, type Page } from '@playwright/test';

async function editorInput(page: Page) {
  const input = page.locator('.monaco-editor textarea.inputarea');
  await expect(input).toBeAttached();
  await input.focus();
  return input;
}

test('Ctrl+/ toggles a single Scarp line and preserves executable source', async ({ page }) => {
  await page.goto('./#code=' + encodeURIComponent('print("first");\nprint("second");'));
  await editorInput(page);
  await page.keyboard.press('ControlOrMeta+Home');
  await page.keyboard.press('ControlOrMeta+/');
  const code = page.locator('.monaco-editor .view-lines');
  await expect(code).toContainText(/\/\/\s*print\("first"\);/);
  await expect(code).toContainText('print("second");');

  // A commented line is not executed by the pinned Scarp interpreter.
  await page.getByRole('button', { name: 'Run code' }).click();
  await expect(page.locator('.stdout')).toHaveText('second\n', { timeout: 30_000 });

  await editorInput(page);
  await page.keyboard.press('ControlOrMeta+Home');
  await page.keyboard.press('ControlOrMeta+/');
  await expect(code.locator('.view-line').first()).not.toContainText('//');
  await page.getByRole('button', { name: 'Run code' }).click();
  await expect(page.locator('.stdout')).toHaveText('first\nsecond\n', { timeout: 30_000 });
});

test('selected lines toggle together and keep normal Monaco undo/redo', async ({ page }) => {
  await page.goto('./#code=' + encodeURIComponent('print("alpha");\nprint("beta");'));
  await editorInput(page);
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.press('ControlOrMeta+/');
  const lines = page.locator('.monaco-editor .view-lines');
  await expect(lines).toContainText(/\/\/\s*print\("alpha"\);/);
  await expect(lines).toContainText(/\/\/\s*print\("beta"\);/);

  await page.keyboard.press('ControlOrMeta+Z');
  await expect(lines.locator('.view-line').first()).not.toContainText('//');
  await expect(lines.locator('.view-line').nth(1)).not.toContainText('//');

  await page.keyboard.press('ControlOrMeta+Shift+Z');
  await expect(lines).toContainText(/\/\/\s*print\("alpha"\);/);
  await expect(lines).toContainText(/\/\/\s*print\("beta"\);/);

  // The native Monaco comment command is itself a toggle, not repeated insertion.
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.press('ControlOrMeta+/');
  await expect(lines.locator('.view-line').first()).not.toContainText('//');
  await expect(lines.locator('.view-line').nth(1)).not.toContainText('//');
});

test('toolbar comment action edits only the selected virtual module and supports undo', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: /Import a module/ }).click();
  await page.getByRole('tab', { name: /math.srp/ }).click();
  await editorInput(page);
  await page.keyboard.press('ControlOrMeta+Home');
  await page.getByRole('button', { name: 'Comment / uncomment' }).click();
  await expect(page.locator('.monaco-editor .view-lines')).toContainText(
    /\/\/\s*pub pure funcra twice/,
  );

  // The source in the importing module must not be modified by comment toggling.
  await page.getByRole('tab', { name: /main.srp/ }).click();
  await expect(page.locator('.monaco-editor .view-lines')).toContainText('math.twice(21)');
  await page.getByRole('tab', { name: /math.srp/ }).click();
  await expect(page.locator('.monaco-editor .view-lines')).toContainText(/\/\/\s*pub pure funcra twice/);
  await editorInput(page);
  await page.keyboard.press('ControlOrMeta+Z');
  await expect(page.locator('.monaco-editor .view-lines')).toContainText('pub pure funcra twice');
  await expect(page.locator('.monaco-editor .view-lines')).not.toContainText('//');
  await page.getByRole('button', { name: 'Run code' }).click();
  await expect(page.locator('.stdout')).toHaveText('42\n', { timeout: 30_000 });
});

test('word wrap is a reversible display-only editor option', async ({ page }) => {
  await page.goto('./#code=' + encodeURIComponent('print("' + 'long'.repeat(100) + '");'));
  const original = 'long'.repeat(100);
  const button = page.getByRole('button', { name: 'Enable word wrap' });
  await expect(button).toHaveAttribute('aria-pressed', 'false');
  await button.click();
  const off = page.getByRole('button', { name: 'Disable word wrap' });
  await expect(off).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.monaco-editor .view-lines')).toContainText(original);
  await off.click();
  await expect(page.getByRole('button', { name: 'Enable word wrap' }))
    .toHaveAttribute('aria-pressed', 'false');
  await page.getByRole('button', { name: 'Run code' }).click();
  await expect(page.locator('.stdout')).toHaveText(original + '\n', { timeout: 30_000 });
});
