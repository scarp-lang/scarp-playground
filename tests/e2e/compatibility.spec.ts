import { expect, test } from '@playwright/test';

// These cases run on Chromium, Firefox and WebKit against the same production
// Vite build and the actual pinned Rust/WASM compiler, never mocked responses.
// Keep them deterministic and bounded; they are not browser-OOM simulations.
test('loads Monaco and runs the real compiler under production CSP', async ({ page }) => {
  await page.goto('./');
  const policy = page.locator('meta[http-equiv="Content-Security-Policy"]');
  await expect(policy).toHaveAttribute('content', /default-src 'self'/);
  await expect(page.locator('.monaco-editor textarea.inputarea')).toBeAttached({ timeout: 30_000 });

  // A policy allowing arbitrary inline code is not an acceptable workaround
  // for a Firefox/WebKit WASM failure.
  const inlineExecuted = await page.evaluate(() => {
    const script = document.createElement('script');
    script.textContent =
      'document.documentElement.setAttribute("data-scarp-inline-test", "executed");';
    document.head.append(script);
    script.remove();
    return document.documentElement.getAttribute('data-scarp-inline-test') === 'executed';
  });
  expect(inlineExecuted).toBe(false);

  await page.getByRole('button', { name: 'Run code' }).click();
  await expect(page.locator('.stdout')).toHaveText('Hello from Scarp!\n', { timeout: 30_000 });
  await expect(page.locator('.result-status.success')).toBeVisible();
});

test('resolves a virtual imported module in Check and Run modes', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: /Import a module/ }).click();
  await expect(page.getByRole('tab', { name: /math.srp/ })).toBeVisible();
  await page.getByRole('button', { name: 'Check code' }).click();
  await expect(page.locator('.terminal-output')).toContainText('Checks passed.', { timeout: 30_000 });
  await expect(page.locator('.stdout')).toHaveCount(0);
  await page.getByRole('button', { name: 'Run code' }).click();
  await expect(page.locator('.stdout')).toHaveText('42\n', { timeout: 30_000 });
  await expect(page.locator('.result-status.success')).toBeVisible();
});

test('returns compiler-owned UTF-8/Unicode diagnostics without partial output', async ({ page }) => {
  await page.goto('./#code=' + encodeURIComponent('print("😀"); print(missing);'));
  await page.getByRole('button', { name: 'Run code' }).click();
  await expect(page.locator('.error-title')).toContainText('E0010', { timeout: 30_000 });
  await expect(page.locator('.error-title')).toContainText('main.srp:1:');
  await expect(page.locator('.stdout')).toHaveCount(0);
  await expect(page.locator('.result-status.failure')).toBeVisible();
});

test('recovers from a bounded interpreter failure in a fresh worker', async ({ page }) => {
  await page.goto('./#code=' + encodeURIComponent('repeat 1200 as index { print("x"); }'));
  await page.getByRole('button', { name: 'Run code' }).click();
  await expect(page.locator('.error-title')).toContainText('E0018', { timeout: 30_000 });
  await expect(page.locator('.stdout')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Run code' })).toBeEnabled();

  await page.goto('./#code=' + encodeURIComponent('print("recovered");'));
  await page.getByRole('button', { name: 'Run code' }).click();
  await expect(page.locator('.stdout')).toHaveText('recovered\n', { timeout: 30_000 });
  await expect(page.locator('.error-panel')).toHaveCount(0);
});
