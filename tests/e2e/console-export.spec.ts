import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';

test('downloads exact UTF-8 stdout after running and disables exports on Clear', async ({ page }) => {
  await page.goto('./');
  const downloadButton = page.getByRole('button', { name: 'Download result' });
  await expect(downloadButton).toBeDisabled();
  await page.getByRole('button', { name: 'Run code' }).click();
  await expect(page.locator('.stdout')).toHaveText('Hello from Scarp!\n', { timeout: 30_000 });
  await expect(downloadButton).toBeEnabled();

  const pending = page.waitForEvent('download');
  await downloadButton.click();
  const download = await pending;
  expect(download.suggestedFilename()).toBe('scarp-result.txt');
  expect(await readFile(await download.path(), 'utf8')).toBe('Hello from Scarp!\n');
  await expect(page.locator('.notice')).toContainText('No source files or stdin were attached');

  await page.getByRole('button', { name: 'Clear' }).click();
  await expect(downloadButton).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Copy result' })).toBeDisabled();
});

test('failed static verification downloads structured diagnostics; passing Check stays silent', async ({ page }) => {
  const source = 'print(unknown_name);';
  await page.goto('./#code=' + encodeURIComponent(source));
  const button = page.getByRole('button', { name: 'Download result' });
  await page.getByRole('button', { name: 'Verify code' }).click();
  await expect(page.locator('.result-status.failure')).toBeVisible({ timeout: 30_000 });
  await expect(button).toBeEnabled();

  const pending = page.waitForEvent('download');
  await button.click();
  const reportDownload = await pending;
  const content = await readFile(await reportDownload.path(), 'utf8');
  expect(content).toContain('Verification failed');
  expect(content).toContain('E0010');
  expect(content).toContain('main.srp:1:');
  expect(content).not.toContain(source);

  await page.goto('./#code=' + encodeURIComponent('print(7);'));
  await page.getByRole('button', { name: 'Check code' }).click();
  await expect(page.locator('.terminal-output')).toContainText('Checks passed.', { timeout: 30_000 });
  await expect(button).toBeDisabled();
});

test('console actions wrap at mobile width without horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('./');
  await page.getByRole('button', { name: 'Run code' }).click();
  const button = page.getByRole('button', { name: 'Download result' });
  await expect(button).toBeEnabled({ timeout: 30_000 });
  await button.scrollIntoViewIfNeeded();
  await expect(button).toBeInViewport();
  expect(await page.locator('body').evaluate(element => element.scrollWidth)).toBeLessThanOrEqual(375);
});

test('copies exact stdout via opt-in clipboard access, not source', async ({ page, context, browserName }) => {
  test.skip(browserName !== 'chromium', 'Clipboard permission is browser-engine-specific.');
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('./#code=' + encodeURIComponent('print("copy this only");'));
  await page.getByRole('button', { name: 'Run code' }).click();
  await expect(page.locator('.stdout')).toHaveText('copy this only\n', { timeout: 30_000 });
  await page.getByRole('button', { name: 'Copy result' }).click();
  await expect(page.locator('.notice')).toContainText('No source files or stdin were attached');
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('copy this only\n');
});

