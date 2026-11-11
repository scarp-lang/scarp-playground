import { expect, test } from '@playwright/test';

test('alpha.7 executes the exact published Unicode conditional fixture in WASM', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: /Conditional values \+ Unicode escapes/ }).click();
  await page.getByRole('button', { name: 'Run code' }).click();
  await expect(page.locator('.stdout')).toHaveText('नमस्ते 👋 7\\n', { timeout: 30_000 });
  await expect(page.locator('.error-panel')).toHaveCount(0);
});

test('alpha.7 evaluates only the selected conditional value', async ({ page }) => {
  await page.goto('./#code=' + encodeURIComponent('print(if true { "safe" } else { read_line() });'));
  await page.getByRole('button', { name: 'Run code' }).click();
  await expect(page.locator('.stdout')).toHaveText('safe\\n', { timeout: 30_000 });
});

test('alpha.7 rejects conditional branches with mismatched types', async ({ page }) => {
  await page.goto('./#code=' + encodeURIComponent('print(if true { "ok" } else { 7 });'));
  await page.getByRole('button', { name: 'Run code' }).click();
  await expect(page.locator('.error-panel')).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('.stdout')).toHaveCount(0);
});

test('alpha.7 rejects surrogate Unicode escapes instead of emitting text', async ({ page }) => {
  const source = String.raw`print("\\u{D800}");`;
  await page.goto('./#code=' + encodeURIComponent(source));
  await page.getByRole('button', { name: 'Run code' }).click();
  await expect(page.locator('.error-panel')).toContainText(/escape|unicode|surrogate/i, { timeout: 30_000 });
  await expect(page.locator('.stdout')).toHaveCount(0);
});
