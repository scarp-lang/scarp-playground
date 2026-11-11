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
  const diff = panel.getByTestId('rename-diff');
  await expect(diff).toBeVisible();
  await expect(diff.getByRole('heading', { name: /main\.srp · 1 changed line/ })).toBeVisible();
  await expect(diff.getByRole('heading', { name: /math\.srp · 1 changed line/ })).toBeVisible();
  await expect(diff.locator('[aria-label="Before rename, main.srp line 2"]'))
    .toHaveText('print(math.twice(21));');
  await expect(diff.locator('[aria-label="After rename, main.srp line 2"]'))
    .toHaveText('print(math.double(21));');
  await expect(diff.locator('[aria-label="Before rename, math.srp line 1"]'))
    .toContainText('funcra twice(');
  await expect(diff.locator('[aria-label="After rename, math.srp line 1"]'))
    .toContainText('funcra double(');
  await expect(page.locator('.stdout')).toHaveCount(0);
  // Inspect a second module without committing or invalidating the preview.
  await diff.getByRole('button', { name: 'Open math.srp line 1' }).click();
  await expect(page.getByRole('tab', { name: /math.srp/ }))
    .toHaveAttribute('aria-selected', 'true');
  await expect(panel.getByRole('button', { name: 'Apply rename to workspace' })).toBeVisible();

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
