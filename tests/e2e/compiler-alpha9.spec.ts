import { expect, test } from '@playwright/test';

// These tests execute the published alpha.9 compiler inside the actual browser WASM Worker.
test('alpha.9 runs the official exact signed BigInt arithmetic fixture', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: /Exact big integers/ }).click();
  await page.getByRole('button', { name: 'Run code' }).click();
  await expect(page.locator('.stdout')).toHaveText(
    '1000000000000000000000000000000\n' +
    '123456788999999999999999999999876543211\n' +
    '-999999999999\n-999999999999999999\ntrue true 1\n',
    { timeout: 30_000 },
  );
  await expect(page.locator('.error-panel')).toHaveCount(0);
});

test('alpha.9 executes a typed BigInt return across imported modules', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: /BigInt across modules/ }).click();
  await expect(page.getByRole('tab', { name: /modules\/bigint_math.srp/ })).toBeVisible();
  await page.getByRole('button', { name: 'Run code' }).click();
  await expect(page.locator('.stdout')).toHaveText('246913578024691357802469135780\n', { timeout: 30_000 });
  await expect(page.locator('.error-panel')).toHaveCount(0);
});

test('alpha.9 rejects malformed decimal input atomically, then recovers', async ({ page }) => {
  await page.goto('./#code=' + encodeURIComponent('print("before"); print(bigint("not-decimal"));'));
  await page.getByRole('button', { name: 'Run code' }).click();
  await expect(page.locator('.error-title')).toContainText('E0051', { timeout: 30_000 });
  await expect(page.locator('.stdout')).toHaveCount(0);
  await page.getByRole('button', { name: /Exact big integers/ }).click();
  await page.getByRole('button', { name: 'Run code' }).click();
  await expect(page.locator('.stdout')).toContainText('1000000000000000000000000000000', { timeout: 30_000 });
  await expect(page.locator('.error-panel')).toHaveCount(0);
});

test('alpha.9 Check code evaluates BigInt without returning program output', async ({ page }) => {
  await page.goto('./#code=' + encodeURIComponent('print(bigint("9223372036854775808"));'));
  await page.getByRole('button', { name: 'Check code' }).click();
  await expect(page.locator('.terminal-output')).toContainText('Checks passed.', { timeout: 30_000 });
  await expect(page.locator('.stdout')).toHaveCount(0);
  await page.getByRole('button', { name: 'Run code' }).click();
  await expect(page.locator('.stdout')).toHaveText('9223372036854775808\n', { timeout: 30_000 });
});

test('alpha.9 enforces the 2048-digit browser quota and discards partial output', async ({ page }) => {
  const source = 'print("before"); print(bigint("' + '9'.repeat(2_049) + '"));';
  // Legacy #code links deliberately reject snippets over 2,000 bytes.
  // Enter the larger regression directly through Monaco instead.
  await page.goto('./');
  const editor = page.locator('.monaco-editor textarea.inputarea');
  await expect(editor).toBeAttached();
  await editor.focus();
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.insertText(source);
  await page.getByRole('button', { name: 'Run code' }).click();
  await expect(page.locator('.result-status.failure')).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('.stdout')).toHaveCount(0);
  await page.getByRole('button', { name: /Hello, Scarp/ }).click();
  await page.getByRole('button', { name: 'Run code' }).click();
  await expect(page.locator('.stdout')).toHaveText('Hello from Scarp!\n', { timeout: 30_000 });
});
