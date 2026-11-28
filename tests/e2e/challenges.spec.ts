import { expect, test } from '@playwright/test';

test('practice a challenge through the pinned interpreter without replacing manual cases', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: 'Learning challenges', exact: true }).click();
  const panel = page.getByRole('region', { name: 'Learning challenges' });
  await expect(panel.getByText('25 of 25 challenges')).toBeVisible();
  await panel.getByLabel('Choose challenge').selectOption('echo-name');
  page.once('dialog', dialog => dialog.accept());
  await panel.getByRole('button', { name: 'Load starter' }).click();
  await expect(panel.getByText('Active challenge: Echo a name.', { exact: false })).toBeVisible();
  await page.getByRole('textbox', { name: /program input/i }).fill('ordinary input');
  await panel.getByRole('button', { name: 'Run challenge cases' }).click();
  const result = panel.getByRole('region', { name: 'Challenge results' });
  await expect(result).toBeVisible({ timeout: 45_000 });
  await expect(result.getByText('All public cases passed.')).toHaveCount(0);
  const editor = page.locator('.monaco-editor textarea.inputarea');
  await editor.focus();
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.insertText('print(read_line());');
  await expect(result).toHaveCount(0);
  await panel.getByRole('button', { name: 'Run challenge cases' }).click();
  await expect(result).toContainText('3 of 3 passed', { timeout: 45_000 });
  await expect(page.getByRole('textbox', { name: /program input/i })).toHaveValue('ordinary input');
  await page.getByRole('button', { name: 'Test cases', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Program test cases' }).getByLabel('Case name')).toHaveValue('Case 1');
  await expect(page.getByRole('region', { name: 'Test case results' })).toHaveCount(0);
  page.once('dialog', dialog => dialog.dismiss());
  await panel.getByRole('button', { name: 'Reset starter' }).click();
  await expect(result).toContainText('3 of 3 passed');
});

test('filter exercises and inspect public solutions on a narrow screen', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('./');
  await page.getByRole('button', { name: 'Learning challenges', exact: true }).click();
  const panel = page.getByRole('region', { name: 'Learning challenges' });
  await panel.getByLabel('Topic').selectOption('Modules');
  await panel.getByLabel('Difficulty').selectOption('advanced');
  await expect(panel.getByLabel('Choose challenge')).toHaveValue('module-generic');
  await panel.getByText('Reveal reference solution', { exact: true }).click();
  await expect(panel.getByText('lib/value.srp', { exact: true })).toBeVisible();
  await panel.getByLabel('Search challenges').fill('nothing matches');
  await expect(panel.getByText('No matching challenges.')).toBeVisible();
  expect(await page.locator('body').evaluate(element => element.scrollWidth)).toBeLessThanOrEqual(375);
});
