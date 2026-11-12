import { expect, test } from '@playwright/test';

test('literal replacement previews every change, then atomically updates and runs code', async ({ page }) => {
  await page.goto('./#code=' + encodeURIComponent('println("red red");\nprintln("red");'));
  await page.getByRole('button', { name: 'Find in project' }).click();
  await page.getByRole('searchbox', { name: 'Search text in project' }).fill('red');
  await page.getByRole('textbox', { name: 'Replacement text (literal)' }).fill('blue');
  await page.getByRole('button', { name: 'Preview replacements' }).click();

  const preview = page.getByTestId('replace-preview');
  await expect(preview).toContainText('3 replacement(s) across 1 file(s) on 2 changed line(s)');
  await expect(preview.locator('.project-replace-line')).toHaveCount(2);
  await expect(preview).toContainText('println("red red")');
  await expect(preview).toContainText('println("blue blue")');
  await expect(page.locator('.monaco-editor .view-lines')).toContainText('red red');

  await page.getByRole('button', { name: 'Apply all replacements' }).click();
  await expect(preview).toHaveCount(0);
  await expect(page.locator('.monaco-editor .view-lines')).toContainText('blue blue');
  await page.getByRole('button', { name: 'Run code' }).click();
  await expect(page.locator('.stdout')).toHaveText('blue blue\nblue\n', { timeout: 30_000 });
});

test('project replace can update real imported modules without invoking compiler during preview', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: /Import a module/ }).click();
  await page.getByRole('button', { name: 'Find in project' }).click();
  await page.getByRole('searchbox', { name: 'Search text in project' }).fill('twice');
  await page.getByRole('textbox', { name: 'Replacement text (literal)' }).fill('double');
  await page.getByRole('button', { name: 'Preview replacements' }).click();
  const preview = page.getByTestId('replace-preview');
  await expect(preview).toContainText('2 replacement(s) across 2 file(s)');
  await expect(preview).toContainText('main.srp:');
  await expect(preview).toContainText('math.srp:');
  await expect(page.locator('.stdout')).toHaveCount(0);

  await page.getByRole('button', { name: 'Apply all replacements' }).click();
  await expect(page.locator('.monaco-editor .view-lines')).toContainText('math.double(21)');
  await page.getByRole('tab', { name: /math.srp/ }).click();
  await expect(page.locator('.monaco-editor .view-lines')).toContainText('funcra double(');
  await page.getByRole('button', { name: 'Run code' }).click();
  await expect(page.locator('.stdout')).toHaveText('42\n', { timeout: 30_000 });
});

test('cancel, query edit and source edit prevent stale apply', async ({ page }) => {
  await page.goto('./#code=' + encodeURIComponent('println("red red");'));
  await page.getByRole('button', { name: 'Find in project' }).click();
  const search = page.getByRole('searchbox', { name: 'Search text in project' });
  await search.fill('red');
  await page.getByRole('textbox', { name: 'Replacement text (literal)' }).fill('blue');
  await page.getByRole('button', { name: 'Preview replacements' }).click();
  await page.getByRole('button', { name: 'Cancel preview' }).click();
  await expect(page.getByRole('button', { name: 'Apply all replacements' })).toHaveCount(0);
  await expect(page.locator('.monaco-editor .view-lines')).toContainText('red red');

  await page.getByRole('button', { name: 'Preview replacements' }).click();
  await search.fill('blue');
  await expect(page.getByTestId('replace-preview')).toHaveCount(0);
  await search.fill('red');
  await page.getByRole('button', { name: 'Preview replacements' }).click();
  const editor = page.locator('.monaco-editor textarea.inputarea');
  await editor.focus();
  await page.keyboard.press('ControlOrMeta+End');
  await page.keyboard.insertText(' ');
  await expect(page.getByTestId('replace-preview')).toHaveCount(0);
});
