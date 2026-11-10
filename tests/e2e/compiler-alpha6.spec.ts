import { expect, test } from '@playwright/test';

test('alpha.6 runs the official Unicode read_line fixture with its supplied stdin', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: /Program input/ }).click();
  const input = page.getByRole('textbox', { name: 'Program input (stdin)' });
  await expect(input).toHaveValue('संस्कार\nfirst line\nlast line\n');
  await page.getByRole('button', { name: 'Run code' }).click();
  await expect(page.locator('.stdout')).toHaveText(
    'Hello संस्कार\n0 first line\n1 last line\n', { timeout: 30_000 },
  );
});

test('alpha.6 input is ephemeral and not exported or restored from a share link', async ({ page }) => {
  await page.goto('./#code=' + encodeURIComponent('print(read_line());'));
  const input = page.getByRole('textbox', { name: 'Program input (stdin)' });
  await input.fill('private runtime value\n');
  await page.getByRole('button', { name: 'Save locally' }).click();
  await page.reload();
  await expect(input).toHaveValue('');
  await page.getByRole('button', { name: 'Run code' }).click();
  await expect(page.locator('.error-title')).toContainText('E0055', { timeout: 30_000 });
});

test('alpha.6 check mode refuses an input read even if buffer is populated', async ({ page }) => {
  await page.goto('./#code=' + encodeURIComponent('print(read_line());'));
  await page.getByRole('textbox', { name: 'Program input (stdin)' }).fill('Ada\n');
  await page.getByRole('button', { name: 'Check code' }).click();
  await expect(page.locator('.error-title')).toContainText('E0054', { timeout: 30_000 });
  await expect(page.locator('.stdout')).toHaveCount(0);
  await page.getByRole('button', { name: 'Run code' }).click();
  await expect(page.locator('.stdout')).toHaveText('Ada\n', { timeout: 30_000 });
});

test('alpha.6 executes tuple values and Unicode text conversions in WASM', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: /Tuple values/ }).click();
  await page.getByRole('button', { name: 'Run code' }).click();
  await expect(page.locator('.stdout')).toHaveText(
    '(7, "नमस्ते")\n7 नमस्ते\n(42,) 42\n', { timeout: 30_000 },
  );
  await page.getByRole('button', { name: /Text conversions/ }).click();
  await page.getByRole('button', { name: 'Run code' }).click();
  await expect(page.locator('.stdout')).toHaveText('42 125.0\n', { timeout: 30_000 });
});

test('alpha.6 bounded stdin rejects oversized UTF-8 content', async ({ page }) => {
  await page.goto('./#code=' + encodeURIComponent('print(read_line());'));
  await page.getByRole('textbox', { name: 'Program input (stdin)' }).fill('😀'.repeat(5000));
  await page.getByRole('button', { name: 'Run code' }).click();
  await expect(page.locator('.error-panel')).toContainText('16 KiB', { timeout: 30_000 });
  await expect(page.locator('.stdout')).toHaveCount(0);
});
