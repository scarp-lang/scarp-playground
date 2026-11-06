import { expect, test } from '@playwright/test';

// Fixed browser corpus: the production Rust/WASM bridge runs each program.
// The larger seeded Rust corpus also mutates the raw JSON and definition paths.
test('bounded malformed sources never leave stale output and permit recovery', async ({ page }) => {
  const inputs = [
    'print("😀"); print(missing);',
    'print("unterminated);',
    'bind x = [1, 2; print(x);',
    'import "../missing.srp" as outside; print(1);',
    'print(text_repeat("x", 12));',
    'var n = 0; while n < 900000 { n += 1; }',
  ];
  for (const source of inputs) {
    await page.goto('./#code=' + encodeURIComponent(source));
    await page.getByRole('button', { name: 'Check code' }).click();
    await expect(page.locator('.result-status')).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('.stdout')).toHaveCount(0);
    await expect(page.locator('.stderr')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Run code' })).toBeEnabled();
  }

  await page.goto('./#code=' + encodeURIComponent('print("recovered after malformed input");'));
  await page.getByRole('button', { name: 'Run code' }).click();
  await expect(page.locator('.stdout')).toHaveText('recovered after malformed input\n', {
    timeout: 30_000,
  });
  await expect(page.locator('.error-panel')).toHaveCount(0);
});
