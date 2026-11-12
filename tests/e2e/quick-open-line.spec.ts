import { expect, test } from '@playwright/test';

test('Ctrl/Cmd+G moves the Monaco cursor to a requested line without executing code', async ({ page }) => {
  const source = ['print("first");', 'print("second");', 'print("third");'].join('\n');
  await page.goto('./#code=' + encodeURIComponent(source));
  const editor = page.locator('.monaco-editor textarea.inputarea');
  await expect(editor).toBeAttached();
  await editor.focus();
  await page.keyboard.press('ControlOrMeta+g');

  const dialog = page.getByRole('dialog', { name: 'Quick open Scarp file' });
  const input = dialog.getByRole('combobox', { name: 'Find .srp file' });
  await expect(input).toBeFocused();
  await expect(input).toHaveValue(':');
  await input.fill(':2:1');
  await input.press('Enter');
  await expect(dialog).toHaveCount(0);
  await expect(editor).toBeFocused();

  await page.keyboard.insertText('// ');
  await page.getByRole('button', { name: 'Run code' }).click();
  await expect(page.locator('.stdout')).toHaveText('first\nthird\n', { timeout: 30_000 });
});

test('Quick Open accepts a module:line:column target without changing the entrypoint', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: /Import a module/ }).click();
  const editor = page.locator('.monaco-editor textarea.inputarea');
  await expect(editor).toBeAttached();
  await editor.focus();
  await page.keyboard.press('ControlOrMeta+p');

  const dialog = page.getByRole('dialog', { name: 'Quick open Scarp file' });
  const input = dialog.getByRole('combobox', { name: 'Find .srp file' });
  await input.fill('MATH.SRP:1:1');
  await expect(dialog.getByRole('option', { name: /math.srp/ })).toBeVisible();
  await input.press('Enter');
  await expect(page.getByRole('tab', { name: /math.srp/ }))
    .toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('.notice')).toContainText('Opened math.srp:1:1.');
  await page.getByRole('button', { name: 'Run code' }).click();
  await expect(page.locator('.stdout')).toHaveText('42\n', { timeout: 30_000 });
});

test('invalid addresses are rejected and Escape restores focus and current file', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: /Import a module/ }).click();
  const button = page.getByRole('button', { name: 'Quick open' });
  await button.click();
  const dialog = page.getByRole('dialog', { name: 'Quick open Scarp file' });
  const input = dialog.getByRole('combobox', { name: 'Find .srp file' });
  for (const invalid of [':0', 'math.srp:0', 'math.srp:2:-1', 'math.srp:1:2:3']) {
    await input.fill(invalid);
    await expect(dialog.getByRole('option')).toHaveCount(0);
    await input.press('Enter');
    await expect(dialog).toBeVisible();
  }
  await input.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(button).toBeFocused();
  await expect(page.getByRole('tab', { name: /main.srp/ }))
    .toHaveAttribute('aria-selected', 'true');
});

test('Go to line button is usable on a narrow mobile viewport', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('./#code=' + encodeURIComponent('print("one");\nprint("two");'));
  const button = page.getByRole('button', { name: 'Go to line' });
  await button.scrollIntoViewIfNeeded();
  await button.click();
  const dialog = page.getByRole('dialog', { name: 'Quick open Scarp file' });
  await dialog.getByRole('combobox', { name: 'Find .srp file' }).fill(':2');
  await expect(dialog.getByRole('option', { name: /main.srp/ })).toBeVisible();
  expect(await page.locator('body').evaluate(element => element.scrollWidth)).toBeLessThanOrEqual(375);
  await dialog.getByRole('combobox', { name: 'Find .srp file' }).press('Enter');
  await expect(page.locator('.notice')).toContainText('Opened main.srp:2:1.');
});

test('Quick Open avoids a cursor position inside a Unicode surrogate pair', async ({ page }) => {
  await page.goto('./#code=' + encodeURIComponent('print("😀good");'));
  const editor = page.locator('.monaco-editor textarea.inputarea');
  await expect(editor).toBeAttached();
  await editor.focus();
  await page.keyboard.press('ControlOrMeta+g');
  const input = page.getByRole('combobox', { name: 'Find .srp file' });
  await input.fill(':1:9');
  await input.press('Enter');
  await expect(editor).toBeFocused();
  await page.keyboard.insertText('!');
  await page.getByRole('button', { name: 'Run code' }).click();
  await expect(page.locator('.stdout')).toHaveText('😀!good\n', { timeout: 30_000 });
});
