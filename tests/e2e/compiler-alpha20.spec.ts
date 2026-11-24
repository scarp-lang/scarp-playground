import { expect, test } from '@playwright/test';

// Real tagged Rust/WASM execution in Chromium, Firefox, and WebKit.
for (const [label, stdout] of [
  ['Tuple element updates', '(50, 100)\n(10, 20)\n'],
  ['Tuple ordering', 'true\nfalse\ntrue\ntrue\n'],
  ['Exact decimal literals', '0.3 true\n0.30000000000000004\n'],
] as const) {
  test('alpha.20 ' + label + ' verifies, checks and runs deterministically', async ({ page }) => {
    await page.goto('./');
    await page.getByRole('button', { name: new RegExp(label) }).click();
    await page.getByRole('button', { name: 'Verify code' }).click();
    await expect(page.locator('.terminal-output')).toContainText(
      'Static verification passed', { timeout: 30_000 },
    );
    await expect(page.locator('.stdout')).toHaveCount(0);
    await page.getByRole('button', { name: 'Check code' }).click();
    await expect(page.locator('.terminal-output')).toContainText('Checks passed.', { timeout: 30_000 });
    await expect(page.locator('.stdout')).toHaveCount(0);
    await page.getByRole('button', { name: 'Run code' }).click();
    await expect(page.locator('.stdout')).toHaveText(stdout, { timeout: 30_000 });
    await expect(page.locator('.result-status.success')).toBeVisible();
  });
}

test('alpha.20 rejects implicit decimal+float coercion with no output leak', async ({ page }) => {
  await page.goto('./#code=' + encodeURIComponent('print("before"); print(0.1d + 0.2);'));
  await page.getByRole('button', { name: 'Run code' }).click();
  await expect(page.locator('.result-status.failure')).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('.stdout')).toHaveCount(0);
  await expect(page.locator('.stderr')).toHaveCount(0);
});
