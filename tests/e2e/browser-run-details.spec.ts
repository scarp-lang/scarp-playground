import { expect, test } from '@playwright/test';

test('shows measured turnaround and UTF-8 sizes without modifying exported output', async ({ page }) => {
  await page.goto('./#code=' + encodeURIComponent('print("😀"); ewrite("é");'));
  await page.getByRole('button', { name: 'Run code' }).click();
  await expect(page.locator('.stdout')).toHaveText('😀\n', { timeout: 30_000 });
  await expect(page.locator('.stderr')).toHaveText('é');
  const stats = page.getByLabel('Browser operation statistics');
  await expect(stats).toContainText('Browser turnaround');
  await expect(stats).toContainText('5 bytes');
  await expect(stats).toContainText('2 bytes');
  await page.getByText('Browser execution limits and measurement notes', { exact: true }).click();
  await expect(page.locator('.browser-run-limits')).toContainText('2,048');
  await expect(page.locator('.browser-run-limits')).toContainText('12 seconds');
  await page.getByRole('button', { name: 'Clear', exact: true }).click();
  await expect(stats).toHaveCount(0);
});

test('Verify and Check report their own semantics, not program execution', async ({ page }) => {
  await page.goto('./#code=' + encodeURIComponent('print(7);'));
  for (const [button, message] of [
    ['Verify code', 'Static verification passed.'],
    ['Check code', 'Checks passed.'],
  ]) {
    await page.getByRole('button', { name: button }).click();
    await expect(page.locator('.terminal-output')).toContainText(message, { timeout: 30_000 });
    await expect(page.locator('.terminal-output')).not.toContainText('Program completed without producing output.');
    await expect(page.getByLabel('Browser operation statistics')).toContainText('Browser turnaround');
    await expect(page.getByLabel('Browser operation statistics')).not.toContainText('stdout');
    await expect(page.locator('.stdout')).toHaveCount(0);
  }
});

test('failed Run displays no captured sizes and next Run has fresh statistics', async ({ page }) => {
  await page.goto('./#code=' + encodeURIComponent('print("before"); assert(false);'));
  await page.getByRole('button', { name: 'Run code' }).click();
  await expect(page.locator('.result-status.failure')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByLabel('Browser operation statistics')).not.toContainText('stdout');
  await expect(page.locator('.stdout')).toHaveCount(0);
  await page.goto('./#code=' + encodeURIComponent('print("ok");'));
  await page.getByRole('button', { name: 'Run code' }).click();
  await expect(page.locator('.stdout')).toHaveText('ok\n', { timeout: 30_000 });
  await expect(page.getByLabel('Browser operation statistics')).toContainText('3 bytes');
});
