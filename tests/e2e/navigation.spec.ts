import { expect, test } from '@playwright/test';

test('F12 navigates to a real Rust-compiler symbol declaration in another module', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: /Import a module/ }).click();
  const editor = page.locator('.monaco-editor textarea.inputarea');
  await expect(editor).toBeAttached();
  await editor.focus();
  await page.keyboard.press('ControlOrMeta+End');
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('Home');
  // print(math.twice(21));: the cursor is placed inside 'twice'.
  for (let i = 0; i < 13; i += 1) await page.keyboard.press('ArrowRight');
  await page.keyboard.press('F12');
  await expect(page.getByRole('tab', { name: /math.srp/ }))
    .toHaveAttribute('aria-selected', 'true', { timeout: 30_000 });
  await expect(page.locator('.notice')).toContainText(
    'Navigated to definition in math.srp',
  );
  await expect(page.locator('.stdout')).toHaveCount(0);
});

test('the accessible Go to definition button navigates from the Monaco cursor', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: /Import a module/ }).click();
  const editor = page.locator('.monaco-editor textarea.inputarea');
  await expect(editor).toBeAttached();
  await editor.focus();
  await page.keyboard.press('ControlOrMeta+End');
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('Home');
  for (let i = 0; i < 13; i += 1) await page.keyboard.press('ArrowRight');
  await page.getByRole('button', { name: 'Go to definition' }).click();
  await expect(page.getByRole('tab', { name: /math.srp/ }))
    .toHaveAttribute('aria-selected', 'true', { timeout: 30_000 });
});

test('F12 reports compiler semantic errors instead of fabricating definitions', async ({ page }) => {
  await page.goto('./#code=' + encodeURIComponent('bind value = 1; print(missing);'));
  const editor = page.locator('.monaco-editor textarea.inputarea');
  await expect(editor).toBeAttached();
  await editor.focus();
  await page.keyboard.press('ControlOrMeta+End');
  for (let i = 0; i < 5; i += 1) await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('F12');
  await expect(page.locator('.error-title')).toContainText('E0010', { timeout: 30_000 });
  await expect(page.locator('.stdout')).toHaveCount(0);
});
