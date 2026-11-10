import { expect, test } from '@playwright/test';

// Output is sourced from the compiler repository's examples/*.stdout fixtures.
// Every case executes with the real, pinned browser WebAssembly interpreter.
const cases = [
  {
    "title": "If / elif / else",
    "expected": "B\nSelected safely.\n"
  },
  {
    "title": "While loops",
    "expected": "12\n"
  },
  {
    "title": "Counted repeat",
    "expected": "8\n0\n"
  },
  {
    "title": "Typed functions",
    "expected": "35\nHello Scarp\n6\n"
  },
  {
    "title": "Writing output",
    "expected": "Hello, Scarp 3 true\n\ndone"
  }
] as const;

for (const { title, expected } of cases) {
  test('official beginner fixture: ' + title, async ({ page }) => {
    await page.goto('./');
    await page.getByRole('button', { name: new RegExp(title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) }).click();
    await page.getByRole('button', { name: 'Run code' }).click();
    await expect(page.locator('.stdout')).toHaveText(expected, { timeout: 30_000 });
    await expect(page.locator('.result-status.success')).toBeVisible();
    await expect(page.locator('.error-panel')).toHaveCount(0);
  });
}
