import { expect, test } from '@playwright/test';

// These tests exercise the real alpha.8 Rust compiler compiled to browser WASM.
test('alpha.8 runs the official Boolean assertion example', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: /Boolean assertions/ }).click();
  await page.getByRole('button', { name: 'Run code' }).click();
  await expect(page.locator('.stdout')).toHaveText('3\n', { timeout: 30_000 });
  await expect(page.locator('.error-panel')).toHaveCount(0);
});

test('alpha.8 reports an E0065 failure without leaking partial stdout', async ({ page }) => {
  const source = 'print("before");\nassert(false, "expected failure");\nprint("after");\n';
  await page.goto('./#code=' + encodeURIComponent(source));
  await page.getByRole('button', { name: 'Run code' }).click();
  await expect(page.locator('.error-title')).toContainText('E0065', { timeout: 30_000 });
  await expect(page.locator('.error-panel')).toContainText('expected failure');
  await expect(page.locator('.stdout')).toHaveCount(0);
});

test('alpha.8 statically rejects non-Boolean assertions', async ({ page }) => {
  await page.goto('./#code=' + encodeURIComponent('assert(1);'));
  await page.getByRole('button', { name: 'Run code' }).click();
  await expect(page.locator('.error-panel')).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('.stdout')).toHaveCount(0);
});

test('Playground Check code evaluates reachable assertions, unlike native static verify', async ({ page }) => {
  await page.goto('./#code=' + encodeURIComponent('assert(false, "reached by check");'));
  await page.getByRole('button', { name: 'Check code' }).click();
  await expect(page.locator('.error-title')).toContainText('E0065', { timeout: 30_000 });
  await expect(page.locator('.stdout')).toHaveCount(0);
});
