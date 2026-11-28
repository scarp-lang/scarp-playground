import { loadExample } from './support/example-switch';
import { expect, test } from '@playwright/test';

// The real published Rust/WASM bridge runs these exact official fixtures in
// Chromium, Firefox and WebKit. No mocked Scarp evaluator is involved.
const published = [
  {
    "title": "Fixed-array traversal",
    "version": "alpha.17",
    "stdout": "Total: 60\nMissing reading: 0\nEmpty length: 0\n"
  },
  {
    "title": "Immutable array updates",
    "version": "alpha.18",
    "stdout": "8 99 3\none नमस्ते\n100\n"
  },
  {
    "title": "Lifetime windows",
    "version": "alpha.18",
    "stdout": "0 [2.0, 3.0]\n0 [integer: 8, 9]\n"
  }
] as const;

for (const fixture of published) {
  test(fixture.version + ' verifies, checks and executes: ' + fixture.title, async ({ page }) => {
    await page.goto('./');
    await loadExample(page, fixture.title);
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
    await expect(page.locator('.stdout')).toHaveText(fixture.stdout, { timeout: 30_000 });
    await expect(page.locator('.error-panel')).toHaveCount(0);
  });
}

test('array_set out of bounds rolls back output and the next Worker recovers', async ({ page }) => {
  await page.goto('./#code=' + encodeURIComponent(
    'print("uncommitted"); eprint("private"); bind a = [array: 1, 2]; print(array_set(a, 9, 7));',
  ));
  await page.getByRole('button', { name: 'Run code' }).click();
  await expect(page.locator('.error-title')).toContainText('E0063', { timeout: 30_000 });
  await expect(page.locator('.stdout')).toHaveCount(0);
  await expect(page.locator('.stderr')).toHaveCount(0);
  await page.goto('./#code=' + encodeURIComponent('print(array_set([array: 1], 0, 2));'));
  await page.getByRole('button', { name: 'Run code' }).click();
  await expect(page.locator('.stdout')).toHaveText('[array: 2]\n', { timeout: 30_000 });
  await expect(page.locator('.error-panel')).toHaveCount(0);
});

test('interactive boolean input remains unavailable inside the browser worker', async ({ page }) => {
  await page.goto('./#code=' + encodeURIComponent(
    'print("uncommitted"); print(input_boolean("Continue? "));',
  ));
  await page.getByRole('textbox', { name: 'Program input (stdin)' }).fill('true');
  await page.getByRole('button', { name: 'Run code' }).click();
  await expect(page.locator('.error-title')).toContainText('E0054', { timeout: 30_000 });
  await expect(page.locator('.stdout')).toHaveCount(0);
});
