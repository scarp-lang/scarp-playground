import { expect, test } from '@playwright/test';

test('cannot remove an imported Scarp module and shows the blocking import location', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: /Import a module/ }).click();
  await page.getByRole('tab', { name: /math.srp/ }).click();
  await page.getByRole('button', { name: 'Remove file' }).click();
  const review = page.getByRole('region', { name: 'Review Scarp module removal' });
  await expect(review).toContainText('Module is imported by 1 statement(s)');
  await expect(review.getByRole('list', { name: 'Blocking module imports' }))
    .toContainText('main.srp:1 imports "math.srp"');
  await expect(review.getByRole('button', { name: 'Confirm remove file' })).toHaveCount(0);
  await review.getByRole('button', { name: 'Cancel file removal' }).click();
  await expect(page.getByRole('tab', { name: /math.srp/ })).toBeVisible();
  await page.getByRole('button', { name: 'Run code' }).click();
  await expect(page.locator('.stdout')).toHaveText('42\n', { timeout: 30_000 });
});

test('removes an unused module with explicit review and restores it using undo', async ({ page }) => {
  await page.goto('./');
  page.once('dialog', dialog => void dialog.accept('unused.srp'));
  await page.getByRole('button', { name: 'Add file' }).click();
  await expect(page.getByRole('tab', { name: /unused.srp/ })).toBeVisible();
  await page.getByRole('button', { name: 'Remove file' }).click();
  const review = page.getByRole('region', { name: 'Review Scarp module removal' });
  await expect(review).toContainText('No other source file imports this module');
  await review.getByRole('button', { name: 'Confirm remove file' }).click();
  await expect(page.getByRole('tab', { name: /unused.srp/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Undo bulk change' })).toBeEnabled();
  await page.getByRole('button', { name: 'Undo bulk change' }).click();
  await expect(page.getByRole('tab', { name: /unused.srp/ }))
    .toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('.monaco-editor .view-lines')).toContainText('New Scarp module');
  await page.getByRole('tab', { name: /main.srp/ }).click();
  await page.getByRole('button', { name: 'Run code' }).click();
  await expect(page.locator('.stdout')).toHaveText('Hello from Scarp!\n', { timeout: 30_000 });
});

test('deleting the entrypoint selects a surviving module and undo restores the entry', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: /Import a module/ }).click();
  await page.getByRole('tab', { name: /main.srp/ }).click();
  await page.getByRole('button', { name: 'Remove file' }).click();
  const review = page.getByRole('region', { name: 'Review Scarp module removal' });
  await expect(review).toContainText('entrypoint will change to math.srp');
  await review.getByRole('button', { name: 'Confirm remove file' }).click();
  await expect(page.getByRole('tab', { name: /main.srp/ })).toHaveCount(0);
  await expect(page.getByRole('tab', { name: /math.srp/ }))
    .toHaveAttribute('aria-selected', 'true');
  await page.getByRole('button', { name: 'Undo bulk change' }).click();
  await expect(page.getByRole('tab', { name: /main.srp/ }))
    .toHaveAttribute('aria-selected', 'true');
  await page.getByRole('button', { name: 'Run code' }).click();
  await expect(page.locator('.stdout')).toHaveText('42\n', { timeout: 30_000 });
});

test('editing a source file cancels a pending deletion review', async ({ page }) => {
  await page.goto('./');
  page.once('dialog', dialog => void dialog.accept('unused.srp'));
  await page.getByRole('button', { name: 'Add file' }).click();
  await page.getByRole('button', { name: 'Remove file' }).click();
  await expect(page.getByRole('region', { name: 'Review Scarp module removal' })).toBeVisible();
  const editor = page.locator('.monaco-editor textarea.inputarea');
  await editor.focus();
  await page.keyboard.press('ControlOrMeta+End');
  await page.keyboard.insertText(' ');
  await expect(page.getByRole('region', { name: 'Review Scarp module removal' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Confirm remove file' })).toHaveCount(0);
  await expect(page.getByRole('tab', { name: /unused.srp/ })).toBeVisible();
});
