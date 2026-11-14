import { expect, test } from '@playwright/test';

// Run the real published alpha.10 Rust interpreter inside the deployed WASM Worker.
test('alpha.10 runs published fixed-array source with Unicode', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: /Fixed-size arrays/ }).click();
  await page.getByRole('button', { name: 'Run code' }).click();
  await expect(page.locator('.stdout')).toHaveText(
    'Scarp 3 [array: <array<integer, 2>>]\n' +
    '[array: "नमस्ते", "Scarp"] true\n', { timeout: 30_000 },
  );
  await expect(page.locator('.error-panel')).toHaveCount(0);
});

test('alpha.10 executes exact divmod, exponent, radix and GCD', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: /Advanced BigInt/ }).click();
  await page.getByRole('button', { name: 'Run code' }).click();
  await expect(page.locator('.stdout')).toHaveText(
    '111111111111111111111111111111 8\n' +
    '129 100000000000000000000000000000000\n' +
    '18446744073709551616 6\n', { timeout: 30_000 },
  );
  await expect(page.locator('.error-panel')).toHaveCount(0);
});

test('alpha.10 preserves Unicode blank lines and detects EOF', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: /EOF-aware input/ }).click();
  await expect(page.getByRole('textbox', { name: 'Program input (stdin)' }))
    .toHaveValue('नमस्ते\n\ncafé 🌍');
  await page.getByRole('button', { name: 'Run code' }).click();
  await expect(page.locator('.stdout')).toHaveText(
    '1 [ नमस्ते ]\n2 [  ]\n3 [ café 🌍 ]\nLines: 3\n',
    { timeout: 30_000 },
  );
});

test('alpha.10 EOF-only fallback preserves a genuinely empty line', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: /Input with fallback/ }).click();
  await page.getByRole('button', { name: 'Run code' }).click();
  await expect(page.locator('.stdout')).toHaveText('Ada Guest\n', { timeout: 30_000 });
  await page.getByRole('textbox', { name: 'Program input (stdin)' }).fill('\n');
  await page.getByRole('button', { name: 'Run code' }).click();
  await expect(page.locator('.stdout')).toHaveText(' Guest\n', { timeout: 30_000 });
});

test('alpha.10 cannot acquire interactive prompts in noninteractive browser execution', async ({ page }) => {
  await page.goto('./#code=' + encodeURIComponent('print("before"); print(ask_or("Name> ", "Guest"));'));
  await page.getByRole('textbox', { name: 'Program input (stdin)' }).fill('Ada\n');
  await page.getByRole('button', { name: 'Run code' }).click();
  await expect(page.locator('.error-title')).toContainText('E0054', { timeout: 30_000 });
  await expect(page.locator('.stdout')).toHaveCount(0);
});
