import { loadExample } from './support/example-switch';
import { expect, test } from '@playwright/test';

// Verify the released alpha.11 Rust interpreter inside the actual WASM Worker.
test('alpha.11 executes the published exact decimal fixture', async ({ page }) => {
  await page.goto('./');
  await loadExample(page, /Exact decimal arithmetic/);
  await page.getByRole('button', { name: 'Run code' }).click();
  await expect(page.locator('.stdout')).toHaveText('235.99\n0.3\n0.33\n', { timeout: 30_000 });
  await expect(page.locator('.error-panel')).toHaveCount(0);
});

test('alpha.11 preserves exact decimal arithmetic across imports', async ({ page }) => {
  await page.goto('./');
  await loadExample(page, /Decimal across modules/);
  await page.getByRole('button', { name: 'Run code' }).click();
  await expect(page.locator('.stdout')).toHaveText('0.3\n', { timeout: 30_000 });
});

test('alpha.11 accepts explicit bounded stdin for decimal conversion', async ({ page }) => {
  await page.goto('./');
  await loadExample(page, /Buffered decimal input/);
  await expect(page.getByRole('textbox', { name: 'Program input (stdin)' })).toHaveValue('1.225\n');
  await page.getByRole('button', { name: 'Run code' }).click();
  await expect(page.locator('.stdout')).toHaveText('1.22\n', { timeout: 30_000 });
});

test('alpha.11 inexact division reports E0070 atomically and recovers', async ({ page }) => {
  await page.goto('./#code=' + encodeURIComponent(
    'print("before"); print(decimal("1") / decimal("3"));',
  ));
  await page.getByRole('button', { name: 'Run code' }).click();
  await expect(page.locator('.error-title')).toContainText('E0070', { timeout: 30_000 });
  await expect(page.locator('.stdout')).toHaveCount(0);
  await page.goto('./#code=' + encodeURIComponent('print(decimal("0.1") + decimal("0.2"));'));
  await page.getByRole('button', { name: 'Run code' }).click();
  await expect(page.locator('.stdout')).toHaveText('0.3\n', { timeout: 30_000 });
});

test('alpha.11 blocks native interactive decimal prompts', async ({ page }) => {
  await page.goto('./#code=' + encodeURIComponent('print(input_decimal("Amount> "));'));
  await page.getByRole('textbox', { name: 'Program input (stdin)' }).fill('1.225\n');
  await page.getByRole('button', { name: 'Run code' }).click();
  await expect(page.locator('.error-title')).toContainText('E0054', { timeout: 30_000 });
  await expect(page.locator('.stdout')).toHaveCount(0);
});
