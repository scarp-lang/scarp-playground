import { expect, test } from '@playwright/test';

// Real Rust/WASM integration: alpha.15 keeps Scarp syntax unchanged but charges
// equal-length UTF-8 string comparisons within the interpreter's work quota.
test('alpha.15 verifies, checks and runs equal-length Unicode comparisons', async ({ page }) => {
  const source = [
    'bind first = "éé";',
    'bind same = "éé";',
    'bind different = "êé";',
    'print(first == same);',
    'print(first != different);',
    'print(first == different);',
    'print(first != same);',
  ].join('\n');
  await page.goto('./#code=' + encodeURIComponent(source));
  await page.getByRole('button', { name: 'Verify code' }).click();
  await expect(page.locator('.terminal-output')).toContainText(
    'Static verification passed', { timeout: 30_000 },
  );
  await expect(page.locator('.stdout')).toHaveCount(0);
  await page.getByRole('button', { name: 'Check code' }).click();
  await expect(page.locator('.terminal-output')).toContainText(
    'Checks passed.', { timeout: 30_000 },
  );
  await expect(page.locator('.stdout')).toHaveCount(0);
  await page.getByRole('button', { name: 'Run code' }).click();
  await expect(page.locator('.stdout')).toHaveText(
    'true\ntrue\nfalse\nfalse\n', { timeout: 30_000 },
  );
  await expect(page.locator('.error-panel')).toHaveCount(0);
});
