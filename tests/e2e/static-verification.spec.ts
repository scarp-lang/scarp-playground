import { expect, test } from '@playwright/test';

test('static Verify succeeds without executing assertions that Check evaluates', async ({ page }) => {
  await page.goto('./#code=' + encodeURIComponent(
    'print("before"); assert(false, "runtime failure");',
  ));
  await page.getByRole('button', { name: 'Verify code' }).click();
  await expect(page.locator('.terminal-output')).toContainText(
    'Static verification passed. Program statements were not executed.', { timeout: 30_000 },
  );
  await expect(page.locator('.stdout')).toHaveCount(0);
  await expect(page.locator('.stderr')).toHaveCount(0);
  await page.getByRole('button', { name: 'Check code' }).click();
  await expect(page.locator('.error-title')).toContainText('E0065', { timeout: 30_000 });
  await expect(page.locator('.stdout')).toHaveCount(0);
});

test('static Verify catches actual compiler name errors with source navigation', async ({ page }) => {
  await page.goto('./#code=' + encodeURIComponent('print(missing_name);'));
  await page.getByRole('button', { name: 'Verify code' }).click();
  await expect(page.locator('.error-title')).toContainText('E0010', { timeout: 30_000 });
  await expect(page.getByRole('button', { name: /Go to error in main.srp/ })).toBeEnabled();
  await expect(page.locator('.stdout')).toHaveCount(0);
});

test('static Verify never consumes stdin and Run still gets real buffered input', async ({ page }) => {
  await page.goto('./#code=' + encodeURIComponent('print(read_line());'));
  const stdin = page.getByRole('textbox', { name: 'Program input (stdin)' });
  await stdin.fill('नमस्ते\n');
  await page.getByRole('button', { name: 'Verify code' }).click();
  await expect(page.locator('.terminal-output')).toContainText(
    'Static verification passed.', { timeout: 30_000 },
  );
  await expect(stdin).toHaveValue('नमस्ते\n');
  await expect(page.locator('.stdout')).toHaveCount(0);
  await page.getByRole('button', { name: 'Check code' }).click();
  await expect(page.locator('.error-title')).toContainText('E0054', { timeout: 30_000 });
  await expect(page.locator('.browser-diagnostic-help')).toContainText('Check evaluates reachable statements but cannot consume program input.');
  await expect(page.locator('.browser-diagnostic-help')).toContainText('Use Verify for static validation');
  await page.getByRole('button', { name: 'Run code' }).click();
  await expect(page.locator('.stdout')).toHaveText('नमस्ते\n', { timeout: 30_000 });
});

test('static Verify permits runtime-invalid decimal text without interpreting it', async ({ page }) => {
  await page.goto('./#code=' + encodeURIComponent(
    'print(decimal("invalid-text"));',
  ));
  await page.getByRole('button', { name: 'Verify code' }).click();
  await expect(page.locator('.terminal-output')).toContainText(
    'Static verification passed.', { timeout: 30_000 },
  );
  await page.getByRole('button', { name: 'Run code' }).click();
  await expect(page.locator('.error-title')).toContainText('E0068', { timeout: 30_000 });
  await expect(page.locator('.stdout')).toHaveCount(0);
});
