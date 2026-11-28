import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

for (const fixture of ["native_recursive_entry","native_nested_aggregate_locals","bigint_wide_exponents"]) {
  test('published alpha.4 interpreter compatibility: ' + fixture, async ({ page }) => {
    const base = 'bridge/tests/fixtures/v007_alpha4/' + fixture;
    const source = readFileSync(base + '.srp', 'utf8');
    const stdout = readFileSync(base + '.stdout', 'utf8');
    await page.goto('./#code=' + encodeURIComponent(source));
    await page.getByRole('button', { name: 'Verify code' }).click();
    await expect(page.locator('.terminal-output')).toContainText('Static verification passed', { timeout: 30_000 });
    await expect(page.locator('.stdout')).toHaveCount(0);
    await page.getByRole('button', { name: 'Check code' }).click();
    await expect(page.locator('.terminal-output')).toContainText('Checks passed.', { timeout: 30_000 });
    await expect(page.locator('.stdout')).toHaveCount(0);
    await page.getByRole('button', { name: 'Run code' }).click();
    await expect(page.locator('.stdout')).toHaveText(stdout, { timeout: 30_000 });
    await expect(page.locator('.result-status.success')).toBeVisible();
    await expect(page.locator('.stderr')).toHaveCount(0);
  });
}
