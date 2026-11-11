import { expect, test } from '@playwright/test';

async function selectImportedFunction(page: import('@playwright/test').Page) {
  await page.getByRole('button', { name: /Import a module/ }).click();
  const editor = page.locator('.monaco-editor textarea.inputarea');
  await expect(editor).toBeAttached();
  await editor.focus();
  await page.keyboard.press('ControlOrMeta+End');
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('Home');
  for (let i = 0; i < 13; i++) await page.keyboard.press('ArrowRight');
  return editor;
}

test('F2 rename previews compiler-owned edits across imports, then runs renamed code', async ({ page }) => {
  await page.goto('./');
  await selectImportedFunction(page);
  await page.keyboard.press('F2');

  const panel = page.getByTestId('rename-panel');
  await expect(panel).toBeVisible();
  await page.getByRole('textbox', { name: 'New Scarp identifier' }).fill('double');
  await page.getByRole('button', { name: 'Preview rename' }).click();
  await expect(panel.getByRole('status')).toContainText('2 site(s) in 2 file(s)', { timeout: 30_000 });
  await expect(panel).toContainText('main.srp, math.srp');
  await expect(page.locator('.stdout')).toHaveCount(0);

  await page.getByRole('button', { name: 'Apply rename to workspace' }).click();
  await expect(panel).toHaveCount(0);
  await expect(page.locator('.monaco-editor .view-lines')).toContainText('math.double(21)', { timeout: 30_000 });
  await page.getByRole('tab', { name: /math.srp/ }).click();
  await expect(page.locator('.monaco-editor .view-lines')).toContainText('funcra double(', { timeout: 30_000 });

  await page.getByRole('button', { name: 'Run code' }).click();
  await expect(page.locator('.stdout')).toHaveText('42\n', { timeout: 30_000 });
});

test('rename refuses an occupied identifier without mutating code', async ({ page }) => {
  await page.goto('./');
  await selectImportedFunction(page);
  await page.getByRole('button', { name: 'Rename symbol' }).click();
  await page.getByRole('textbox', { name: 'New Scarp identifier' }).fill('math');
  await page.getByRole('button', { name: 'Preview rename' }).click();
  await expect(page.locator('.notice')).toContainText(
    /already occurs in this workspace/i, { timeout: 30_000 },
  );
  await expect(page.getByRole('button', { name: 'Apply rename to workspace' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Cancel rename' }).click();
  await expect(page.locator('.monaco-editor .view-lines')).toContainText('math.twice(21)');
});

test('editing a source invalidates an uncommitted compiler rename preview', async ({ page }) => {
  await page.goto('./');
  const editor = await selectImportedFunction(page);
  await page.getByRole('button', { name: 'Rename symbol' }).click();
  await page.getByRole('textbox', { name: 'New Scarp identifier' }).fill('double');
  await page.getByRole('button', { name: 'Preview rename' }).click();
  await expect(page.getByRole('button', { name: 'Apply rename to workspace' })).toBeVisible({
    timeout: 30_000,
  });
  await editor.focus();
  await page.keyboard.insertText(' ');
  await expect(page.getByTestId('rename-panel')).toHaveCount(0);
});
