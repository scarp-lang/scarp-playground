import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

for (const fixture of ['string_operators', 'generic_functions', 'generic_variants']) {
  test('published alpha.3 interpreter compatibility: ' + fixture, async ({ page }) => {
    const base = 'bridge/tests/fixtures/v007_alpha3/' + fixture;
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

for (const [fixture, title] of [["generic_functions","Generic functions and inference"],["generic_variants","Generic Option and Result"],["string_operators","String operators and literals"]] as const) {
  test('alpha.3 example browser: ' + title, async ({ page }) => {
    await page.goto('./');
    await page.getByRole('searchbox', { name: 'Find an example' }).fill('v0.0.7-alpha.3');
    await expect(page.locator('.example-button')).toHaveCount(3);
    await page.locator('.example-button').filter({ has: page.getByText(title, { exact: true }) }).click();
    await page.getByRole('button', { name: 'Run code' }).click();
    const output = readFileSync('bridge/tests/fixtures/v007_alpha3/' + fixture + '.stdout', 'utf8');
    await expect(page.locator('.stdout')).toHaveText(output, { timeout: 30_000 });
    await expect(page.locator('.result-status.success')).toBeVisible();
    await expect(page.locator('.stderr')).toHaveCount(0);
  });
}
