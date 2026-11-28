import { loadExample } from './support/example-switch';
import { expect, test } from '@playwright/test';

// These cases run the published Scarp interpreter in a real disposable
// WebAssembly Worker on Chromium, Firefox and WebKit.
test('official alpha.17 typed Boolean prompt uses explicit buffered input', async ({ page }) => {
  await page.goto('./');
  await loadExample(page, /Typed Boolean prompts/);
  const toggle = page.getByRole('checkbox', { name: 'Enable prompt functions with supplied input' });
  const input = page.getByRole('textbox', { name: 'Program input (stdin)' });
  await expect(toggle).toBeChecked();
  await expect(input).toHaveValue('true\nfalse\n');
  await page.getByRole('button', { name: 'Verify code' }).click();
  await expect(page.locator('.terminal-output')).toContainText(
    'Static verification passed', { timeout: 30_000 },
  );
  await page.getByRole('button', { name: 'Run code' }).click();
  await expect(page.locator('.stdout')).toHaveText("Continue (true/false)? Continue (true/false)? Continuing\nStopped\n", { timeout: 30_000 });
  await expect(page.locator('.result-status.success')).toBeVisible();
  await loadExample(page, 'Hello, Scarp');
  await expect(toggle).not.toBeChecked();
  await expect(input).toHaveValue('');
});

test('typed prompts remain denied unless explicitly opted in; Check remains noninteractive', async ({ page }) => {
  await page.goto('./#code=' + encodeURIComponent('print(input_boolean("Confirm? "));'));
  const input = page.getByRole('textbox', { name: 'Program input (stdin)' });
  const toggle = page.getByRole('checkbox', { name: 'Enable prompt functions with supplied input' });
  await input.fill('true\n');
  await page.getByRole('button', { name: 'Run code' }).click();
  await expect(page.locator('.error-title')).toContainText('E0054', { timeout: 30_000 });
  await toggle.check();
  await page.getByRole('button', { name: 'Check code' }).click();
  await expect(page.locator('.error-title')).toContainText('E0054', { timeout: 30_000 });
  await page.getByRole('button', { name: 'Run code' }).click();
  await expect(page.locator('.stdout')).toHaveText('Confirm? true\n', { timeout: 30_000 });
  await toggle.uncheck();
  await page.getByRole('button', { name: 'Run code' }).click();
  await expect(page.locator('.error-title')).toContainText('E0054', { timeout: 30_000 });
  await expect(page.locator('.stdout')).toHaveCount(0);
});

test('invalid buffered boolean never leaks partial captured output or prompt text', async ({ page }) => {
  await page.goto('./#code=' + encodeURIComponent(
    'eprint("before"); print(input_boolean("Confirm? "));',
  ));
  const input = page.getByRole('textbox', { name: 'Program input (stdin)' });
  await input.fill('maybe\n');
  await page.getByRole('checkbox', { name: 'Enable prompt functions with supplied input' }).check();
  await page.getByRole('button', { name: 'Run code' }).click();
  await expect(page.locator('.error-title')).toContainText('E0084', { timeout: 30_000 });
  await expect(page.locator('.stdout')).toHaveCount(0);
  await expect(page.locator('.stderr')).toHaveCount(0);
  await input.fill('false\n');
  await page.getByRole('button', { name: 'Run code' }).click();
  await expect(page.locator('.stdout')).toHaveText('Confirm? false\n', { timeout: 30_000 });
  await expect(page.locator('.stderr')).toHaveText('before\n');
});

test('buffered prompt input and opt-in are never persisted after saving source', async ({ page }) => {
  await page.goto('./#code=' + encodeURIComponent('print(input_integer("Age? "));'));
  const toggle = page.getByRole('checkbox', { name: 'Enable prompt functions with supplied input' });
  const input = page.getByRole('textbox', { name: 'Program input (stdin)' });
  await input.fill('42\n');
  await toggle.check();
  await page.getByRole('button', { name: 'Run code' }).click();
  await expect(page.locator('.stdout')).toHaveText('Age? 42\n', { timeout: 30_000 });
  await page.getByRole('button', { name: 'Save locally' }).click();
  await page.reload();
  await expect(input).toHaveValue('');
  await expect(toggle).not.toBeChecked();
  await page.getByRole('button', { name: 'Run code' }).click();
  await expect(page.locator('.error-title')).toContainText('E0054', { timeout: 30_000 });
});
