import { expect, test } from '@playwright/test';

// These execute the actual pinned Rust interpreter in WASM under the real
// 12-second browser-worker deadline. No synthetic compiler results are used.
test('output statement pressure is bounded, atomic and recoverable in Chromium', async ({ page }) => {
  await page.goto('./#code=' + encodeURIComponent(
    'repeat 1200 as index { print("x"); }',
  ));
  await page.getByRole('button', { name: 'Run code' }).click();
  await expect(page.locator('.error-title')).toContainText('E0018', { timeout: 30_000 });
  await expect(page.locator('.stdout')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Run code' })).toBeEnabled();

  await page.goto('./#code=' + encodeURIComponent('print("ready after output limit");'));
  await page.getByRole('button', { name: 'Run code' }).click();
  await expect(page.locator('.stdout')).toHaveText('ready after output limit\n', {
    timeout: 30_000,
  });
  await expect(page.locator('.error-title')).toHaveCount(0);
});

test('recursive call pressure cannot poison later browser executions', async ({ page }) => {
  const program = [
    'pure funcra dive(n: integer) -> integer {',
    'if n == 0 { return 0; }',
    'return dive(n - 1);',
    '}',
    'print("before"); print(dive(1000));',
  ].join(' ');
  await page.goto('./#code=' + encodeURIComponent(program));
  await page.getByRole('button', { name: 'Run code' }).click();
  await expect(page.locator('.error-title')).toContainText('E0027', { timeout: 30_000 });
  await expect(page.locator('.stdout')).toHaveCount(0);
  await page.goto('./#code=' + encodeURIComponent('print("recovered");'));
  await page.getByRole('button', { name: 'Run code' }).click();
  await expect(page.locator('.stdout')).toHaveText('recovered\n', { timeout: 30_000 });
});

test('large buffered stdout is rejected before partial output reaches the DOM', async ({ page }) => {
  await page.goto('./#code=' + encodeURIComponent(
    'bind chunk = text_repeat("x", 60000); repeat 20 as index { print(chunk); }',
  ));
  await page.getByRole('button', { name: 'Run code' }).click();
  await expect(page.locator('.error-title')).toContainText('E0029', { timeout: 30_000 });
  await expect(page.locator('.stdout')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Run code' })).toBeEnabled();
});
