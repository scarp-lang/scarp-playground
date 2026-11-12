import { expect, test } from '@playwright/test';

test('renames an imported module with complete preview, then runs and undoes it', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: /Import a module/ }).click();
  await page.getByRole('tab', { name: /math.srp/ }).click();
  await page.getByRole('button', { name: 'Rename file' }).click();
  await page.getByLabel('New relative .srp path').fill('lib/math.srp');
  await page.getByRole('button', { name: 'Preview file rename' }).click();
  const preview = page.getByTestId('file-move-preview');
  await expect(preview).toContainText('math.srp');
  await expect(preview).toContainText('lib/math.srp');
  await expect(preview).toContainText('rewrite 1 import path(s)');
  await expect(preview).toContainText('import "math.srp" as math;');
  await expect(preview).toContainText('import "lib/math.srp" as math;');
  await expect(page.getByRole('tab', { name: /math.srp/ })).toBeVisible();
  await page.getByRole('button', { name: 'Apply file rename' }).click();

  await expect(preview).toHaveCount(0);
  await expect(page.getByRole('tab', { name: /lib\/math.srp/ })).toBeVisible();
  await page.getByRole('tab', { name: /main.srp/ }).click();
  await expect(page.locator('.monaco-editor .view-lines')).toContainText(
    'import "lib/math.srp" as math;',
  );
  await page.getByRole('button', { name: 'Run code' }).click();
  await expect(page.locator('.stdout')).toHaveText('42\n', { timeout: 30_000 });

  await page.getByRole('button', { name: 'Undo bulk change' }).click();
  await expect(page.getByRole('tab', { name: /^.*math.srp/ })).toBeVisible();
  await expect(page.getByRole('tab', { name: /lib\/math.srp/ })).toHaveCount(0);
  await expect(page.locator('.monaco-editor .view-lines')).toContainText(
    'import "math.srp" as math;',
  );
  await page.getByRole('button', { name: 'Run code' }).click();
  await expect(page.locator('.stdout')).toHaveText('42\n', { timeout: 30_000 });
});

test('moving an entry file to a new directory rebases its own imports', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: /Import a module/ }).click();
  await page.getByRole('tab', { name: /main.srp/ }).click();
  await page.getByRole('button', { name: 'Rename file' }).click();
  await page.getByLabel('New relative .srp path').fill('apps/main.srp');
  await page.getByRole('button', { name: 'Preview file rename' }).click();
  const preview = page.getByTestId('file-move-preview');
  await expect(preview).toContainText('The project entry point will be updated.');
  await expect(preview).toContainText('import "../math.srp" as math;');
  await page.getByRole('button', { name: 'Apply file rename' }).click();
  await expect(page.getByRole('tab', { name: /apps\/main.srp/ })).toBeVisible();
  await expect(page.locator('.monaco-editor .view-lines')).toContainText(
    'import "../math.srp" as math;',
  );
  await page.getByRole('button', { name: 'Run code' }).click();
  await expect(page.locator('.stdout')).toHaveText('42\n', { timeout: 30_000 });
  await page.getByRole('button', { name: 'Undo bulk change' }).click();
  await expect(page.getByRole('tab', { name: /apps\/main.srp/ })).toHaveCount(0);
  await expect(page.getByRole('tab', { name: /main.srp/ })).toBeVisible();
  await expect(page.locator('.monaco-editor .view-lines')).toContainText(
    'import "math.srp" as math;',
  );
});

test('cancelling or modifying the proposed file path invalidates its preview', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: /Import a module/ }).click();
  await page.getByRole('tab', { name: /math.srp/ }).click();
  await page.getByRole('button', { name: 'Rename file' }).click();
  const path = page.getByLabel('New relative .srp path');
  await path.fill('lib/maths.srp');
  await page.getByRole('button', { name: 'Preview file rename' }).click();
  await expect(page.getByTestId('file-move-preview')).toBeVisible();
  await path.fill('lib/arithmetic.srp');
  await expect(page.getByTestId('file-move-preview')).toHaveCount(0);
  await page.getByRole('button', { name: 'Cancel file rename' }).click();
  await expect(page.getByRole('button', { name: 'Apply file rename' })).toHaveCount(0);
  await expect(page.getByRole('tab', { name: /math.srp/ })).toBeVisible();
});

test('invalid duplicate destination is rejected before changing source and editing invalidates preview', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: /Import a module/ }).click();
  await page.getByRole('button', { name: 'Rename file' }).click();
  await page.getByLabel('New relative .srp path').fill('math.srp');
  await page.getByRole('button', { name: 'Preview file rename' }).click();
  await expect(page.getByTestId('file-move-preview')).toHaveCount(0);
  await expect(page.getByText(/destination must be a different unused/)).toBeVisible();
  await page.getByLabel('New relative .srp path').fill('app.srp');
  await page.getByRole('button', { name: 'Preview file rename' }).click();
  await expect(page.getByTestId('file-move-preview')).toBeVisible();
  const editor = page.locator('.monaco-editor textarea.inputarea');
  await editor.focus();
  await page.keyboard.press('ControlOrMeta+End');
  await page.keyboard.insertText(' ');
  await expect(page.getByTestId('file-move-preview')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Apply file rename' })).toHaveCount(0);
});

test('narrow screens keep the file rename form and complete import review accessible', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('./');
  await page.getByRole('button', { name: /Import a module/ }).click();
  await page.getByRole('tab', { name: /math.srp/ }).click();
  const button = page.getByRole('button', { name: 'Rename file' });
  await button.scrollIntoViewIfNeeded();
  await button.click();
  await page.getByLabel('New relative .srp path').fill('pkg/math.srp');
  await page.getByRole('button', { name: 'Preview file rename' }).click();
  await expect(page.getByTestId('file-move-preview')).toContainText('pkg/math.srp');
  const width = await page.locator('body').evaluate(element => element.scrollWidth);
  expect(width).toBeLessThanOrEqual(375);
});
