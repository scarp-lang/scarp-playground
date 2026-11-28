import { expect, test } from '@playwright/test';

test('captures source, previews exact differences, restores and undoes without changing stdin', async ({ page }) => {
  await page.goto('./#code=' + encodeURIComponent('print("before");\n'));
  await page.getByRole('textbox', { name: /program input/i }).fill('kept input');
  await page.getByRole('button', { name: 'Source checkpoint', exact: true }).click();
  const panel = page.getByRole('region', { name: 'Source checkpoint' });
  await panel.getByRole('button', { name: 'Capture checkpoint' }).click();
  await expect(panel).toContainText('0 changed source files');
  const editor = page.locator('.monaco-editor textarea.inputarea');
  await editor.focus();
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.insertText('print("after");\n');
  await expect(panel).toContainText('1 changed source files');
  const diff = panel.getByRole('region', { name: 'Changes in main.srp' });
  await expect(diff).toContainText('print("before");');
  await expect(diff).toContainText('print("after");');
  const dismissed = page.waitForEvent('dialog').then(dialog => dialog.dismiss());
  await panel.getByRole('button', { name: 'Restore checkpoint' }).click();
  await dismissed;
  await expect(panel).toContainText('1 changed source files');
  const accepted = page.waitForEvent('dialog').then(dialog => dialog.accept());
  await panel.getByRole('button', { name: 'Restore checkpoint' }).click();
  await accepted;
  await expect(panel).toContainText('0 changed source files');
  await expect(page.getByRole('textbox', { name: /program input/i })).toHaveValue('kept input');
  await page.getByRole('button', { name: 'Run code' }).click();
  await expect(page.locator('.stdout')).toHaveText('before\n', { timeout: 30_000 });
  await page.getByRole('button', { name: 'Undo bulk change' }).click();
  await expect(panel).toContainText('1 changed source files');
  await page.getByRole('button', { name: 'Run code' }).click();
  await expect(page.locator('.stdout')).toHaveText('after\n', { timeout: 30_000 });
});

test('checkpoint does not persist after reload and fits narrow viewports', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('./');
  await page.getByRole('button', { name: 'Source checkpoint', exact: true }).click();
  const panel = page.getByRole('region', { name: 'Source checkpoint' });
  await panel.getByRole('button', { name: 'Capture checkpoint' }).click();
  await expect(panel.getByRole('button', { name: 'Replace checkpoint' })).toBeVisible();
  expect(await page.locator('body').evaluate(element => element.scrollWidth)).toBeLessThanOrEqual(375);
  await page.getByRole('button', { name: 'Save locally' }).click();
  await page.reload();
  await page.getByRole('button', { name: 'Source checkpoint', exact: true }).click();
  await expect(panel).toContainText('No checkpoint captured.');
});
