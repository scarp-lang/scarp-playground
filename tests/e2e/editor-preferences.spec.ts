import { expect, test } from '@playwright/test';

test('applies editor preferences without replacing source or persisting input', async ({ page }) => {
  await page.goto('./');
  await expect(page.locator('.monaco-editor textarea.inputarea')).toBeAttached();
  const editor = page.locator('.monaco-editor textarea.inputarea');
  await editor.focus();
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.insertText('print("preserved source");');
  await page.getByRole('textbox', { name: /program input/i }).fill('private input');
  await page.getByRole('button', { name: 'Editor preferences', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Editor preferences' });
  await dialog.getByLabel('Font size').selectOption('20');
  await dialog.getByLabel('Tab size').selectOption('4');
  await dialog.getByLabel('Editor height').selectOption('tall');
  await dialog.getByLabel('Word wrap', { exact: true }).check();
  await dialog.getByRole('button', { name: 'Apply preferences' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator('.editor-body')).toHaveAttribute('data-editor-height', 'tall');
  await expect(page.getByRole('button', { name: 'Disable word wrap' })).toBeVisible();
  await expect(page.locator('.monaco-editor .view-lines')).toContainText('preserved source');
  await expect(page.getByRole('textbox', { name: /program input/i })).toHaveValue('private input');
  const stored = await page.evaluate(() => localStorage.getItem('scarp-playground-editor-preferences-v1'));
  expect(JSON.parse(stored ?? '{}').preferences.fontSize).toBe(20);
  expect(stored).not.toContain('private input');
  expect(stored).not.toContain('preserved source');
  await page.getByRole('button', { name: 'Run code' }).click();
  await expect(page.locator('.stdout')).toHaveText('preserved source', { timeout: 30_000 });
});

test('cancels changes, remembers applied preferences, and resets explicitly', async ({ page }) => {
  await page.goto('./');
  const open = page.getByRole('button', { name: 'Editor preferences', exact: true });
  const dialog = page.getByRole('dialog', { name: 'Editor preferences' });
  await open.click();
  await dialog.getByLabel('Font size').selectOption('22');
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await open.click();
  await expect(dialog.getByLabel('Font size')).toHaveValue('14');
  await dialog.getByLabel('Font size').selectOption('18');
  await dialog.getByLabel('Editor height').selectOption('compact');
  await dialog.getByRole('button', { name: 'Apply preferences' }).click();
  await page.reload();
  await expect(page.locator('.editor-body')).toHaveAttribute('data-editor-height', 'compact');
  await open.click();
  await expect(dialog.getByLabel('Font size')).toHaveValue('18');
  await dialog.getByRole('button', { name: 'Reset defaults' }).click();
  await expect(dialog.getByLabel('Font size')).toHaveValue('14');
  await dialog.getByRole('button', { name: 'Apply preferences' }).click();
  await expect(page.locator('.editor-body')).toHaveAttribute('data-editor-height', 'standard');
});

test('opens from the command palette on a narrow screen', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('./');
  await page.getByRole('button', { name: 'Commands', exact: true }).click();
  const search = page.getByRole('combobox', { name: 'Search commands' });
  await search.fill('editor preferences');
  await search.press('Enter');
  const dialog = page.getByRole('dialog', { name: 'Editor preferences' });
  await expect(dialog).toBeVisible();
  const size = await dialog.boundingBox();
  expect(size && size.width).toBeLessThanOrEqual(375);
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(dialog).toHaveCount(0);
});
