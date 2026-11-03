import { expect, test } from '@playwright/test';

// These tests deliberately use the built Rust/WASM compiler, not mock responses.
// The preview server serves the same /scarp-playground/ base path as GitHub Pages.
test('boots the real interpreter and executes the official hello sample', async ({ page }) => {
  await page.goto('./');
  await expect(page.getByRole('heading', { name: 'Code. Run. Learn.' })).toBeVisible();
  await page.getByRole('button', { name: 'Run code' }).click();
  await expect(page.locator('.stdout')).toHaveText('Hello from Scarp!\n', { timeout: 30_000 });
  await expect(page.locator('.result-status.success')).toBeVisible();
  await expect(page.locator('.error-panel')).toHaveCount(0);
});

test('imports and executes another .srp source file in the real module loader', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: /Import a module/ }).click();
  await expect(page.getByRole('tab', { name: /math.srp/ })).toBeVisible();
  await page.getByRole('button', { name: 'Run code' }).click();
  await expect(page.locator('.stdout')).toHaveText('42\n', { timeout: 30_000 });
  await expect(page.locator('.result-status.success')).toBeVisible();
});

test('reports a real schema-1 compiler diagnostic for an unknown identifier', async ({ page }) => {
  await page.goto('./#code=' + encodeURIComponent('print(unknown_variable);'));
  await page.getByRole('button', { name: 'Run code' }).click();
  await expect(page.locator('.error-title')).toContainText('E0010', { timeout: 30_000 });
  await expect(page.locator('.error-title')).toContainText('main.srp:1:');
  await expect(page.locator('.result-status.failure')).toBeVisible();
  await expect(page.locator('.stdout')).toHaveCount(0);
});

test('the interpreter enforces its work budget without freezing the browser', async ({ page }) => {
  const longProgram = 'var n = 0; while n < 1000000 { n += 1; }';
  await page.goto('./#code=' + encodeURIComponent(longProgram));
  await page.getByRole('button', { name: 'Run code' }).click();
  await expect(page.locator('.error-title')).toContainText('E0017', { timeout: 30_000 });
  await expect(page.getByRole('button', { name: 'Run code' })).toBeEnabled();
});

test('theme switch is interactive and persists after reload', async ({ page }) => {
  await page.goto('./');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.getByRole('button', { name: 'Switch to light theme' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.getByRole('button', { name: 'Switch to dark theme' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
});

test('supports a narrow mobile viewport without hiding execution controls', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('./');
  await expect(page.getByRole('button', { name: 'Run code' })).toBeVisible();
  await expect(page.getByRole('tab', { name: /main.srp/ })).toBeVisible();
  await page.getByRole('button', { name: 'Run code' }).click();
  await expect(page.locator('.stdout')).toHaveText('Hello from Scarp!\n', { timeout: 30_000 });
  const rootWidth = await page.locator('body').evaluate((element) => element.scrollWidth);
  expect(rootWidth).toBeLessThanOrEqual(375);
});
