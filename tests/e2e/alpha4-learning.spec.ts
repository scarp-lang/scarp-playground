import { loadExample } from './support/example-switch';
import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

const cases = [{"title":"Mutual recursion and GCD","stdout":"native_recursive_entry.stdout"},{"title":"Nested aggregate snapshots","stdout":"native_nested_aggregate_locals.stdout"},{"title":"BigInt wide exponents","stdout":"bigint_wide_exponents.stdout"},{"title":"Contextual generic imports","stdout":"context/expected.stdout"},{"title":"BigInt sequences and number theory","stdout":"bigint_number_theory.stdout"}];

for (const { title, stdout } of cases) {
  test('alpha.4 learning example: ' + title, async ({ page }) => {
    await page.goto('./');
    const filter = page.getByRole('searchbox', { name: 'Find an example' });
    await filter.fill(title);
    await loadExample(page, title);
    await page.getByRole('button', { name: 'Verify code' }).click();
    await expect(page.locator('.terminal-output')).toContainText('Static verification passed', { timeout: 30_000 });
    await page.getByRole('button', { name: 'Run code' }).click();
    await expect(page.locator('.stdout')).toHaveText(readFileSync('bridge/tests/fixtures/v007_alpha4/' + stdout, 'utf8'), { timeout: 30_000 });
    await expect(page.locator('.result-status.success')).toBeVisible();
    await expect(page.locator('.stderr')).toHaveCount(0);
  });
}

test('Monaco offers wide exponent snippets in actual source', async ({ page }) => {
  await page.goto('./');
  const input = page.locator('.monaco-editor textarea.inputarea');
  await expect(input).toBeAttached();
  await input.focus();
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.insertText('bigint_pow_mod_b');
  await page.keyboard.press('Control+Space');
  await expect(page.locator('.suggest-widget.visible')).toContainText('bigint_pow_mod_big');
});
