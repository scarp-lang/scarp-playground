import { expect, test } from '@playwright/test';

test('stdin editor enforces the exact UTF-8 byte ceiling for emoji across browsers', async ({ page }) => {
  await page.goto('./');
  const input = page.getByRole('textbox', { name: 'Program input (stdin)' });
  const valid = '😀'.repeat(4096); // 8192 UTF-16 units, 16384 UTF-8 bytes
  await input.fill(valid);
  await expect(input).toHaveValue(valid);
  await expect(page.locator('.stdin-heading')).toContainText('16384 / 16384 UTF-8 bytes');
  await input.fill(valid + '😀');
  await expect(input).toHaveValue(valid);
  await expect(page.locator('.notice')).toContainText('Previous input was kept');
  await expect(page.locator('.stdin-heading')).toContainText('16384 / 16384 UTF-8 bytes');
  await input.fill('short\n');
  await expect(input).toHaveValue('short\n');
  await expect(page.locator('.stdin-heading')).toContainText('6 / 16384 UTF-8 bytes');
});

test('over-budget input edits retain prior input and successful compiler result', async ({ page }) => {
  await page.goto('./#code=' + encodeURIComponent('print(read_line());'));
  const input = page.getByRole('textbox', { name: 'Program input (stdin)' });
  await input.fill('Kept\n');
  await page.getByRole('button', { name: 'Run code' }).click();
  await expect(page.locator('.stdout')).toHaveText('Kept\n', { timeout: 30_000 });

  await input.fill('x'.repeat(16385));
  await expect(input).toHaveValue('Kept\n');
  await expect(page.locator('.notice')).toContainText('Previous input was kept');
  await expect(page.locator('.stdout')).toHaveText('Kept\n');
  await page.getByRole('button', { name: 'Run code' }).click();
  await expect(page.locator('.stdout')).toHaveText('Kept\n', { timeout: 30_000 });
});
