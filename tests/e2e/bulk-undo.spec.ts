import { expect, test, type Page } from '@playwright/test';

async function openReplace(page: Page, search: string, replacement: string) {
  await page.getByRole('button', { name: 'Find in project' }).click();
  await page.getByRole('searchbox', { name: 'Search text in project' }).fill(search);
  await page.getByRole('textbox', { name: 'Replacement text (literal)' }).fill(replacement);
  await page.getByRole('button', { name: 'Preview replacements' }).click();
  await expect(page.getByTestId('replace-preview')).toBeVisible();
}

test('one-step undo completely restores a plain-text project replacement', async ({ page }) => {
  await page.goto('./#code=' + encodeURIComponent('println("red red");\nprintln("red");'));
  const undo = page.getByRole('button', { name: 'Undo bulk change' });
  await expect(undo).toBeDisabled();
  await openReplace(page, 'red', 'blue');
  await page.getByRole('button', { name: 'Apply all replacements' }).click();
  await expect(page.locator('.monaco-editor .view-lines')).toContainText('blue blue');
  await expect(undo).toBeEnabled();
  await undo.click();
  await expect(undo).toBeDisabled();
  await expect(page.locator('.monaco-editor .view-lines')).toContainText('red red');
  await page.getByRole('button', { name: 'Run code' }).click();
  await expect(page.locator('.stdout')).toHaveText('red red\nred\n', { timeout: 30_000 });
});

test('undo restores original sources for every affected imported module', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: /Import a module/ }).click();
  await openReplace(page, 'twice', 'double');
  await expect(page.getByTestId('replace-preview')).toContainText('2 replacement(s) across 2 file(s)');
  await page.getByRole('button', { name: 'Apply all replacements' }).click();
  await expect(page.locator('.monaco-editor .view-lines')).toContainText('math.double(21)');
  await page.getByRole('button', { name: 'Undo bulk change' }).click();
  await expect(page.locator('.monaco-editor .view-lines')).toContainText('math.twice(21)');
  await page.getByRole('tab', { name: /math.srp/ }).click();
  await expect(page.locator('.monaco-editor .view-lines')).toContainText('funcra twice(');
  await page.getByRole('button', { name: 'Run code' }).click();
  await expect(page.locator('.stdout')).toHaveText('42\n', { timeout: 30_000 });
});

test('compiler-validated symbol rename has the same one-step undo guarantee', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: /Import a module/ }).click();
  const editor = page.locator('.monaco-editor textarea.inputarea');
  await expect(editor).toBeAttached();
  await editor.focus();
  await page.keyboard.press('ControlOrMeta+End');
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('Home');
  for (let i = 0; i < 13; i++) await page.keyboard.press('ArrowRight');
  await page.keyboard.press('F2');
  await page.getByRole('textbox', { name: 'New Scarp identifier' }).fill('double');
  await page.getByRole('button', { name: 'Preview rename' }).click();
  await expect(page.getByRole('button', { name: 'Apply rename to workspace' })).toBeEnabled({
    timeout: 30_000,
  });
  await page.getByRole('button', { name: 'Apply rename to workspace' }).click();
  await expect(page.locator('.monaco-editor .view-lines')).toContainText('math.double(21)');
  await page.getByRole('button', { name: 'Undo bulk change' }).click();
  await expect(page.locator('.monaco-editor .view-lines')).toContainText('math.twice(21)');
  await page.getByRole('tab', { name: /math.srp/ }).click();
  await expect(page.locator('.monaco-editor .view-lines')).toContainText('funcra twice(');
});

test('editing after an applied replacement invalidates undo without reverting new work', async ({ page }) => {
  await page.goto('./#code=' + encodeURIComponent('println("red");'));
  await openReplace(page, 'red', 'blue');
  await page.getByRole('button', { name: 'Apply all replacements' }).click();
  const undo = page.getByRole('button', { name: 'Undo bulk change' });
  await expect(undo).toBeEnabled();
  const editor = page.locator('.monaco-editor textarea.inputarea');
  await editor.focus();
  await page.keyboard.press('ControlOrMeta+End');
  await page.keyboard.insertText(' ');
  await expect(undo).toBeDisabled();
  await expect(page.locator('.monaco-editor .view-lines')).toContainText('blue');
  await expect(page.locator('.monaco-editor .view-lines')).not.toContainText('red');
});
