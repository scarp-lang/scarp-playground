import { expect, test } from '@playwright/test';

test('duplicates an imported library without changing its caller and supports undo', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: /Import a module/ }).click();
  await page.getByRole('tab', { name: /math.srp/ }).click();
  await page.getByRole('button', { name: 'Duplicate file' }).click();
  const path = page.getByRole('textbox', { name: 'New copy .srp path' });
  await expect(path).toHaveValue('math_copy.srp');
  await page.getByRole('button', { name: 'Preview duplication' }).click();
  const preview = page.getByTestId('file-duplicate-preview');
  await expect(preview).toContainText('rebasing 0 import path(s)');
  await expect(preview).toContainText('The original module and entrypoint remain unchanged');
  await expect(page.getByRole('tab', { name: /math_copy.srp/ })).toHaveCount(0);
  await page.getByRole('button', { name: 'Apply duplication' }).click();
  await expect(preview).toHaveCount(0);
  await expect(page.getByRole('tab', { name: /math_copy.srp/ }))
    .toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('.monaco-editor .view-lines')).toContainText('funcra twice(');

  await page.getByRole('tab', { name: /main.srp/ }).click();
  await expect(page.locator('.monaco-editor .view-lines')).toContainText('import "math.srp" as math;');
  await page.getByRole('button', { name: 'Run code' }).click();
  await expect(page.locator('.stdout')).toHaveText('42\n', { timeout: 30_000 });

  await page.getByRole('button', { name: 'Undo bulk change' }).click();
  await expect(page.getByRole('tab', { name: /math_copy.srp/ })).toHaveCount(0);
  await expect(page.getByRole('tab', { name: /math.srp/ })).toBeVisible();
  await page.getByRole('button', { name: 'Run code' }).click();
  await expect(page.locator('.stdout')).toHaveText('42\n', { timeout: 30_000 });
});

test('copying the entrypoint into a subfolder rebases the imported module and executes', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: /Import a module/ }).click();
  await page.getByRole('tab', { name: /main.srp/ }).click();
  await page.getByRole('button', { name: 'Duplicate file' }).click();
  const path = page.getByRole('textbox', { name: 'New copy .srp path' });
  await path.fill('apps/main_copy.srp');
  await page.getByRole('button', { name: 'Preview duplication' }).click();
  const preview = page.getByTestId('file-duplicate-preview');
  await expect(preview).toContainText('rebasing 1 import path(s)');
  await expect(preview).toContainText('import "math.srp" as math;');
  await expect(preview).toContainText('import "../math.srp" as math;');
  await expect(page.getByRole('tab', { name: /apps\/main_copy.srp/ })).toHaveCount(0);
  await page.getByRole('button', { name: 'Apply duplication' }).click();
  await expect(page.getByRole('tab', { name: /apps\/main_copy.srp/ }))
    .toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('.monaco-editor .view-lines')).toContainText(
    'import "../math.srp" as math;',
  );
  await page.getByRole('button', { name: 'Set as entry' }).click();
  await page.getByRole('button', { name: 'Run code' }).click();
  await expect(page.locator('.stdout')).toHaveText('42\n', { timeout: 30_000 });
  await page.getByRole('tab', { name: /main.srp/ }).click();
  await expect(page.locator('.monaco-editor .view-lines')).toContainText(
    'import "math.srp" as math;',
  );
});

test('changing the duplicate destination, cancelling, and editing reject stale plans', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: /Import a module/ }).click();
  await page.getByRole('button', { name: 'Duplicate file' }).click();
  const path = page.getByRole('textbox', { name: 'New copy .srp path' });
  await path.fill('math.srp');
  await page.getByRole('button', { name: 'Preview duplication' }).click();
  await expect(page.getByTestId('file-duplicate-preview')).toHaveCount(0);
  await expect(page.getByText(/different unused destination/)).toBeVisible();
  await path.fill('lib/main_copy.srp');
  await page.getByRole('button', { name: 'Preview duplication' }).click();
  await expect(page.getByTestId('file-duplicate-preview')).toBeVisible();
  await path.fill('lib/main_copy2.srp');
  await expect(page.getByTestId('file-duplicate-preview')).toHaveCount(0);
  await page.getByRole('button', { name: 'Preview duplication' }).click();
  await page.getByRole('button', { name: 'Cancel duplication' }).click();
  await expect(page.getByRole('button', { name: 'Apply duplication' })).toHaveCount(0);
  await expect(page.getByRole('tab', { name: /lib\/main_copy2.srp/ })).toHaveCount(0);

  await page.getByRole('button', { name: 'Duplicate file' }).click();
  await page.getByRole('button', { name: 'Preview duplication' }).click();
  await expect(page.getByTestId('file-duplicate-preview')).toBeVisible();
  const editor = page.locator('.monaco-editor textarea.inputarea');
  await editor.focus();
  await page.keyboard.press('ControlOrMeta+End');
  await page.keyboard.insertText(' ');
  await expect(page.getByTestId('file-duplicate-preview')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Apply duplication' })).toHaveCount(0);
});

test('duplicate source review remains usable at narrow mobile width', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('./');
  const button = page.getByRole('button', { name: 'Duplicate file' });
  await button.scrollIntoViewIfNeeded();
  await button.click();
  await page.getByRole('textbox', { name: 'New copy .srp path' }).fill('sub/main_copy.srp');
  await page.getByRole('button', { name: 'Preview duplication' }).click();
  await expect(page.getByTestId('file-duplicate-preview')).toContainText('sub/main_copy.srp');
  const width = await page.locator('body').evaluate(element => element.scrollWidth);
  expect(width).toBeLessThanOrEqual(375);
});
