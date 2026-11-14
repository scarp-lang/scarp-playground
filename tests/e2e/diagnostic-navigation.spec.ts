import { expect, test } from '@playwright/test';

test('clicking a compiler error focuses the exact token in an imported module', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: /Import a module/ }).click();
  await page.getByRole('tab', { name: /math.srp/ }).click();
  const editor = page.locator('.monaco-editor textarea.inputarea');
  await expect(editor).toBeAttached();
  await editor.focus();
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.insertText(
    'pub pure funcra twice(n: integer) -> integer {\n  return missing;\n}\n',
  );
  await page.getByRole('tab', { name: /main.srp/ }).click();
  await page.getByRole('button', { name: 'Run code' }).click();
  await expect(page.locator('.error-title')).toContainText('E0010', { timeout: 30_000 });
  const jump = page.getByRole('button', { name: 'Go to error in math.srp' });
  await expect(jump).toBeVisible();
  await jump.click();
  await expect(page.getByRole('tab', { name: /math.srp/ })).toHaveAttribute('aria-selected', 'true');
  await expect(editor).toBeFocused();
  await page.keyboard.insertText('repaired_');
  await expect(page.locator('.monaco-editor .view-lines')).toContainText('return repaired_missing;');
  await expect(page.locator('.error-panel')).toHaveCount(0);
});

test('compiler related declaration links navigate to exact same-file source positions', async ({ page }) => {
  await page.goto('./#code=' + encodeURIComponent(
    'bind value = 1;\nbind value = 2;\nprint(value);',
  ));
  await page.getByRole('button', { name: 'Check code' }).click();
  await expect(page.locator('.error-title')).toContainText('E0011', { timeout: 30_000 });
  const related = page.locator('.diagnostic-related').first();
  await expect(related).toBeVisible();
  await related.click();
  const editor = page.locator('.monaco-editor textarea.inputarea');
  await expect(editor).toBeFocused();
  await expect(page.locator('.notice')).toContainText('Opened compiler location main.srp:1:');
  await page.keyboard.insertText('fixed_');
  await expect(page.locator('.monaco-editor .view-line').first()).toContainText('bind fixed_value = 1;');
  await expect(page.locator('.error-panel')).toHaveCount(0);
});
