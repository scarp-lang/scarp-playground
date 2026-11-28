import { expect, test } from '@playwright/test';

test('runs distinct buffered inputs and reports exact mismatches without changing editor stdin', async ({ page }) => {
  await page.goto('./#code=' + encodeURIComponent('print(read_line());'));
  await page.getByRole('textbox', { name: /program input/i }).fill('editor input');
  await page.getByRole('button', { name: 'Test cases', exact: true }).click();
  const panel = page.getByRole('region', { name: 'Program test cases' });
  const first = panel.getByRole('group', { name: 'Case 1', exact: true });
  await first.getByLabel('Case name').fill('Unicode');
  await first.getByLabel('Test stdin').fill('नमस्ते\n');
  await first.getByLabel('Expected stdout').fill('नमस्ते\n');
  await panel.getByRole('button', { name: 'Add test case' }).click();
  const second = panel.getByRole('group', { name: 'Case 2', exact: true });
  await second.getByLabel('Case name').fill('Wrong newline');
  await second.getByLabel('Test stdin').fill('hello\n');
  await second.getByLabel('Expected stdout').fill('hello');
  await panel.getByRole('button', { name: 'Run test cases' }).click();
  const report = panel.getByRole('region', { name: 'Test case results' });
  await expect(report).toContainText('1 passed · 1 failed · 0 execution errors · 0 not run', { timeout: 45_000 });
  await expect(report).toContainText('Unicode — passed');
  await expect(report).toContainText('stdout: length differs');
  await expect(page.getByRole('textbox', { name: /program input/i })).toHaveValue('editor input');
  await second.getByLabel('Expected stdout').fill('hello\n');
  await expect(report).toHaveCount(0);
  await panel.getByRole('button', { name: 'Run test cases' }).click();
  await expect(report).toContainText('2 passed · 0 failed', { timeout: 45_000 });
  await page.getByRole('button', { name: 'Run code' }).click();
  await expect(page.locator('.stdout')).toHaveText('editor input\n', { timeout: 30_000 });
});

test('requires a real diagnostic code and discards stale results on source edits', async ({ page }) => {
  await page.goto('./#code=' + encodeURIComponent('funcra f<T,T>(a:T)->T{return a;}'));
  await page.getByRole('button', { name: 'Test cases', exact: true }).click();
  const panel = page.getByRole('region', { name: 'Program test cases' });
  await panel.getByLabel('Expected result').selectOption('diagnostic');
  await expect(panel.getByRole('button', { name: 'Run test cases' })).toBeDisabled();
  await panel.getByLabel('Expected diagnostic code').fill('E0085');
  await panel.getByRole('button', { name: 'Run test cases' }).click();
  const report = panel.getByRole('region', { name: 'Test case results' });
  await expect(report).toContainText('Received expected compiler diagnostic E0085.', { timeout: 30_000 });
  const editor = page.locator('.monaco-editor textarea.inputarea');
  await editor.focus();
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.insertText('print(42);');
  await expect(report).toHaveCount(0);
  await panel.getByRole('button', { name: 'Run test cases' }).click();
  await expect(report).toContainText('Expected E0085, received successful execution.', { timeout: 30_000 });
});

test('test cases fit narrow screens and do not persist buffered test data', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('./');
  await page.getByRole('button', { name: 'Test cases', exact: true }).click();
  const panel = page.getByRole('region', { name: 'Program test cases' });
  await panel.getByLabel('Test stdin').fill('temporary test input');
  expect(await page.locator('body').evaluate(element => element.scrollWidth)).toBeLessThanOrEqual(375);
  await page.getByRole('button', { name: 'Save locally' }).click();
  await page.reload();
  await page.getByRole('button', { name: 'Test cases', exact: true }).click();
  await expect(panel.getByLabel('Test stdin')).toHaveValue('');
});
