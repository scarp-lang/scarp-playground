import { expect, test } from '@playwright/test';

for (const [label, stdout] of [
  ["Fixed-array concatenation","[array: 12, 18]\n[array: 12, 18, 24]\n[array: 12, 18, 24]\n"],
  ["Variadic integer reductions","6 6 12 24\n"],
  ["Stable vector softplus","3\ntrue true\ntrue true\ntrue\n"],
  ["Call-frame snapshot reuse","[array: 7, 8]\n[array: 42, 43]\n"],
] as const) {
  test('v0.0.7-alpha.1: ' + label, async ({ page }) => {
    await page.goto('./');
    await page.getByRole('button', { name: new RegExp(label) }).click();
    await page.getByRole('button', { name: 'Verify code' }).click();
    await expect(page.locator('.terminal-output')).toContainText('Static verification passed', { timeout: 30_000 });
    await expect(page.locator('.stdout')).toHaveCount(0);
    await page.getByRole('button', { name: 'Check code' }).click();
    await expect(page.locator('.terminal-output')).toContainText('Checks passed.', { timeout: 30_000 });
    await expect(page.locator('.stdout')).toHaveCount(0);
    await page.getByRole('button', { name: 'Run code' }).click();
    await expect(page.locator('.stdout')).toHaveText(stdout, { timeout: 30_000 });
    await expect(page.locator('.result-status.success')).toBeVisible();
  });
}

for (const source of [
  'print("before"); print(array_concat([array:1], [array:<float>]));',
  'print("before"); print(integer_hcf(1));',
  'print("before"); print(softplus(1.0));',
]) {
  test('rejects invalid v0.0.7-alpha.1 call: ' + source, async ({ page }) => {
    await page.goto('./#code=' + encodeURIComponent(source));
    await page.getByRole('button', { name: 'Run code' }).click();
    await expect(page.locator('.result-status.failure')).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('.stdout')).toHaveCount(0);
    await expect(page.locator('.stderr')).toHaveCount(0);
  });
}
