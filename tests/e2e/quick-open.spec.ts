import { expect, test } from '@playwright/test';

test('Ctrl/Cmd+P opens file search from Monaco and navigates an imported module', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: /Import a module/ }).click();
  const editor = page.locator('.monaco-editor textarea.inputarea');
  await expect(editor).toBeAttached();
  await editor.focus();
  await page.keyboard.press('ControlOrMeta+p');
  const dialog = page.getByRole('dialog', { name: 'Quick open Scarp file' });
  await expect(dialog).toBeVisible();
  const input = page.getByRole('combobox', { name: 'Find .srp file' });
  await expect(input).toBeFocused();
  await input.fill('math');
  await expect(dialog.getByRole('option')).toHaveCount(1);
  await expect(dialog.getByRole('option', { name: /math.srp/ })).toBeVisible();
  await input.press('Enter');
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('tab', { name: /math.srp/ }))
    .toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('.monaco-editor .view-lines')).toContainText('funcra twice(');
  await page.getByRole('button', { name: 'Run code' }).click();
  await expect(page.locator('.stdout')).toHaveText('42\n', { timeout: 30_000 });
});

test('ArrowDown and ArrowUp navigate results without changing sources', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: /Import a module/ }).click();
  await page.getByRole('button', { name: 'Quick open' }).click();
  const dialog = page.getByRole('dialog', { name: 'Quick open Scarp file' });
  const input = dialog.getByRole('combobox', { name: 'Find .srp file' });
  await expect(dialog.getByRole('option')).toHaveCount(2);
  await expect(dialog.getByRole('option', { name: /main.srp/ }))
    .toHaveAttribute('aria-selected', 'true');
  await input.press('ArrowDown');
  await expect(dialog.getByRole('option', { name: /math.srp/ }))
    .toHaveAttribute('aria-selected', 'true');
  await input.press('ArrowUp');
  await expect(dialog.getByRole('option', { name: /main.srp/ }))
    .toHaveAttribute('aria-selected', 'true');
  await input.press('ArrowDown');
  await input.press('Enter');
  await expect(page.getByRole('tab', { name: /math.srp/ }))
    .toHaveAttribute('aria-selected', 'true');
  await page.getByRole('button', { name: 'Quick open' }).click();
  await expect(dialog.getByRole('combobox', { name: 'Find .srp file' })).toHaveValue('');
  await dialog.getByRole('button', { name: 'Close Quick Open' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('tab', { name: /math.srp/ }))
    .toHaveAttribute('aria-selected', 'true');
});

test('unmatched search and Escape close without switching active files', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: /Import a module/ }).click();
  await page.getByRole('button', { name: 'Quick open' }).click();
  const dialog = page.getByRole('dialog', { name: 'Quick open Scarp file' });
  const input = dialog.getByRole('combobox', { name: 'Find .srp file' });
  await input.fill('unknown-module');
  await expect(dialog.getByText(/No matching .srp files/)).toBeVisible();
  await expect(dialog.getByRole('option')).toHaveCount(0);
  await input.press('Enter');
  await expect(dialog).toBeVisible();
  await input.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('tab', { name: /main.srp/ }))
    .toHaveAttribute('aria-selected', 'true');
});

test('quick-open search and file choices stay accessible on a narrow viewport', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('./');
  await page.getByRole('button', { name: /Import a module/ }).click();
  const button = page.getByRole('button', { name: 'Quick open' });
  await button.scrollIntoViewIfNeeded();
  await button.click();
  const dialog = page.getByRole('dialog', { name: 'Quick open Scarp file' });
  await dialog.getByRole('combobox', { name: 'Find .srp file' }).fill('MATH.SRP');
  const option = dialog.getByRole('option', { name: /math.srp/ });
  await expect(option).toBeVisible();
  const width = await page.locator('body').evaluate(element => element.scrollWidth);
  expect(width).toBeLessThanOrEqual(375);
  await option.click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('tab', { name: /math.srp/ }))
    .toHaveAttribute('aria-selected', 'true');
});
