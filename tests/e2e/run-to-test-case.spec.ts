import { expect, test } from '@playwright/test';

test('a successful real Run can become an exact output regression test', async ({ page }) => {
  await page.goto('./#code=' + encodeURIComponent('print("captured result");\n'));
  await page.getByRole('button', { name: 'Test cases' }).click();
  const panel = page.getByRole('region', { name: 'Program test cases' });
  const capture = panel.getByLabel('Capture last program run');
  await expect(capture.getByRole('button', { name: 'Preview last Run as test case' }))
    .toBeDisabled();

  await page.getByRole('button', { name: 'Run code' }).click();
  await expect(page.locator('.stdout')).toHaveText('captured result\n', { timeout: 30_000 });
  await expect(capture.getByRole('button', { name: 'Preview last Run as test case' }))
    .toBeEnabled();
  await capture.getByRole('button', { name: 'Preview last Run as test case' }).click();
  const preview = capture.getByLabel('Captured Run preview');
  await expect(preview).toContainText('Captured run 1');
  await expect(preview).toContainText('expected bytes');
  page.once('dialog', dialog => void dialog.accept());
  await preview.getByRole('button', { name: 'Add reviewed captured test' }).click();
  await expect(panel).toContainText('2 / 8 cases');
  await expect(panel.getByRole('textbox', { name: 'Case name' })).toHaveCount(2);

  await panel.getByRole('button', { name: 'Run test cases' }).click();
  await expect(panel.getByLabel('Test case results')).toContainText(
    'Captured run 1 — passed', { timeout: 30_000 },
  );
});

test('capture preview alone never adds tests or stores output in the URL', async ({ page }) => {
  await page.goto('./#code=' + encodeURIComponent('print("LOCAL_ONLY_RESULT");\n'));
  await page.getByRole('button', { name: 'Run code' }).click();
  await expect(page.locator('.stdout')).toContainText('LOCAL_ONLY_RESULT', { timeout: 30_000 });
  await page.getByRole('button', { name: 'Test cases' }).click();
  const panel = page.getByRole('region', { name: 'Program test cases' });
  const button = panel.getByRole('button', { name: 'Preview last Run as test case' });
  await expect(button).toBeEnabled();
  await button.click();
  await expect(panel.getByLabel('Captured Run preview')).toBeVisible();
  await panel.getByRole('button', { name: 'Cancel capture' }).click();
  await expect(panel).toContainText('1 / 8 cases');
  const data = await page.evaluate(() => ({
    hash: window.location.hash,
    storage: JSON.stringify(Object.entries(window.localStorage)),
  }));
  expect(JSON.stringify(data)).not.toContain('Captured run 1');
});

test('a page reload does not reconstruct a private capture of a previous compiler Run', async ({ page }) => {
  await page.goto('./#code=' + encodeURIComponent('print("hello");'));
  await page.getByRole('button', { name: 'Run code' }).click();
  await expect(page.locator('.stdout')).toContainText('hello', { timeout: 30_000 });
  await page.getByRole('button', { name: 'Test cases' }).click();
  await expect(page.getByRole('button', { name: 'Preview last Run as test case' }))
    .toBeEnabled();
  await page.reload();
  await page.getByRole('button', { name: 'Test cases' }).click();
  await expect(page.getByRole('button', { name: 'Preview last Run as test case' }))
    .toBeDisabled();
});
