import { expect, test } from '@playwright/test';

test('compiler-backed Find References lists declaration and cross-module calls', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: /Import a module/ }).click();
  const editor = page.locator('.monaco-editor textarea.inputarea');
  await expect(editor).toBeAttached();
  await editor.focus();
  await page.keyboard.press('ControlOrMeta+End');
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('Home');
  for (let i = 0; i < 13; i += 1) await page.keyboard.press('ArrowRight');
  await page.getByRole('button', { name: 'Find references' }).click();
  const panel = page.getByTestId('references-panel');
  await expect(panel).toContainText('References: twice', { timeout: 30_000 });
  await expect(panel.getByRole('button', { name: /Go to declaration at math.srp/ })).toBeVisible();
  await expect(panel.getByRole('button', { name: /Go to call at main.srp/ })).toBeVisible();
  await expect(page.locator('.stdout')).toHaveCount(0);
  await panel.getByRole('button', { name: /Go to declaration at math.srp/ }).click();
  await expect(page.getByRole('tab', { name: /math.srp/ })).toHaveAttribute('aria-selected', 'true');
  await page.getByRole('button', { name: 'Close references' }).click();
  await expect(panel).toHaveCount(0);
});

test('Find References does not evaluate input or print side effects', async ({ page }) => {
  await page.goto('./#code=' + encodeURIComponent('bind name = read_line(); print(name);'));
  const editor = page.locator('.monaco-editor textarea.inputarea');
  await expect(editor).toBeAttached();
  await editor.focus();
  await page.keyboard.press('ControlOrMeta+End');
  await page.keyboard.press('Home');
  for (let i = 0; i < 31; i += 1) await page.keyboard.press('ArrowRight');
  await page.getByRole('button', { name: 'Find references' }).click();
  await expect(page.getByTestId('references-panel')).toContainText('References: name', { timeout: 30_000 });
  await expect(page.locator('.stdout')).toHaveCount(0);
});
