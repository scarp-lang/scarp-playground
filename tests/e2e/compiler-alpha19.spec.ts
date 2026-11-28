import { loadExample } from './support/example-switch';
import { expect, test } from '@playwright/test';

// Executes the published compiler's alpha.19 fixture in real browser WebAssembly.
test('alpha.19 named functions keep Verify and Check silent and Run exact', async ({ page }) => {
  await page.goto('./');
  await loadExample(page, /Named function boundaries/);
  await page.getByRole('button', { name: 'Verify code' }).click();
  await expect(page.locator('.terminal-output')).toContainText(
    'Static verification passed', { timeout: 30_000 },
  );
  await expect(page.locator('.stdout')).toHaveCount(0);
  await page.getByRole('button', { name: 'Check code' }).click();
  await expect(page.locator('.terminal-output')).toContainText('Checks passed.', { timeout: 30_000 });
  await expect(page.locator('.stdout')).toHaveCount(0);
  await page.getByRole('button', { name: 'Run code' }).click();
  await expect(page.locator('.stdout')).toHaveText("12\n7\n", { timeout: 30_000 });
  await expect(page.locator('.result-status.success')).toBeVisible();
});

test('alpha.19 host-only callable handles do not enable function aliases in Scarp source', async ({ page }) => {
  const source = "pure funcra twice(n: integer) -> integer { return n * 2; }\nbind callback = twice; print(callback(3));";
  await page.goto('./#code=' + encodeURIComponent(source));
  await page.getByRole('button', { name: 'Run code' }).click();
  await expect(page.locator('.result-status.failure')).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('.stdout')).toHaveCount(0);
  await expect(page.locator('.stderr')).toHaveCount(0);
});
