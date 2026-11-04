import { expect, test } from '@playwright/test';

type CspObservations = Window & { __scarpCspViolations?: string[] };

test('production CSP permits real Scarp WASM and Monaco but blocks inline JavaScript', async ({ page }) => {
  await page.addInitScript(() => {
    const observedWindow = window as CspObservations;
    observedWindow.__scarpCspViolations = [];
    window.addEventListener('securitypolicyviolation', (event) => {
      observedWindow.__scarpCspViolations?.push(event.effectiveDirective);
    });
  });

  await page.goto('./');
  const meta = page.locator('meta[http-equiv="Content-Security-Policy"]');
  const policy = await meta.getAttribute('content');
  expect(policy).toContain("default-src 'none'");
  expect(policy).toContain("script-src 'self' 'wasm-unsafe-eval'");
  expect(policy).toContain("worker-src 'self'");
  expect(policy).toContain("connect-src 'self'");
  expect(policy).not.toContain("'unsafe-eval'");
  const editor = page.locator('.monaco-editor textarea.inputarea');
  await expect(editor).toBeAttached();

  // This executes real Rust/WASM in a disposable Worker, not a mocked result.
  await page.getByRole('button', { name: 'Run code' }).click();
  await expect(page.locator('.stdout')).toHaveText('Hello from Scarp!\n', { timeout: 30_000 });

  // No ordinary app action should generate a CSP violation.
  const normalViolations = await page.evaluate(
    () => (window as CspObservations).__scarpCspViolations ?? [],
  );
  expect(normalViolations).toEqual([]);

  // A dynamically injected inline script should be refused by the actual browser.
  const ranInline = await page.evaluate(() => {
    const probe = document.createElement('script');
    probe.textContent = "document.documentElement.dataset.scarpCspProbe = 'executed';";
    document.body.appendChild(probe);
    return document.documentElement.dataset.scarpCspProbe === 'executed';
  });
  expect(ranInline).toBe(false);
  await expect.poll(() => page.evaluate(
    () => (window as CspObservations).__scarpCspViolations ?? [],
  )).toContain('script-src-elem');
});

test('CSP keeps multi-file imports and actual compiler diagnostics working', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: /Import a module/ }).click();
  await page.getByRole('button', { name: 'Run code' }).click();
  await expect(page.locator('.stdout')).toHaveText('42\n', { timeout: 30_000 });
  await page.goto('./#code=' + encodeURIComponent('print(unknown_variable);'));
  await page.getByRole('button', { name: 'Run code' }).click();
  await expect(page.locator('.error-title')).toContainText('E0010', { timeout: 30_000 });
});
