import { expect, test } from '@playwright/test';

test('captured stdout is searchable without running the program a second time', async ({ page }) => {
  await page.goto('./');
  await expect(page.getByRole('button', { name: 'Find in output' })).toBeDisabled();
  await page.getByRole('button', { name: 'Run code' }).click();
  await expect(page.locator('.stdout')).toHaveText('Hello from Scarp!\n', { timeout: 30_000 });
  await page.getByRole('button', { name: 'Find in output' }).click();
  const panel = page.getByRole('region', { name: 'Search captured program output' });
  await expect(panel).toBeVisible();
  await panel.getByLabel('Literal output text').fill('hello');
  await panel.getByRole('button', { name: 'Find output matches' }).click();
  await expect(panel.getByLabel('Output search summary')).toContainText('1 match(es)');
  const matches = panel.getByLabel('Output search matches');
  await expect(matches).toContainText('stdout:1:1');
  await expect(matches.locator('mark')).toHaveText('Hello');
  await expect(page.locator('.stdout')).toHaveText('Hello from Scarp!\n');
});

test('Unicode output search reports exact UTF-16 columns', async ({ page }) => {
  await page.goto('./#code=' + encodeURIComponent('print("😀 नमस्ते 😀");\n'));
  await page.getByRole('button', { name: 'Run code' }).click();
  await expect(page.locator('.stdout')).toContainText('😀 नमस्ते 😀', { timeout: 30_000 });
  await page.getByRole('button', { name: 'Find in output' }).click();
  const panel = page.getByRole('region', { name: 'Search captured program output' });
  await panel.getByLabel('Literal output text').fill('😀');
  await panel.getByRole('button', { name: 'Find output matches' }).click();
  await expect(panel.getByLabel('Output search summary')).toContainText('2 match(es)');
  const hits = panel.getByLabel('Output search matches');
  await expect(hits.locator('mark')).toHaveCount(2);
  await expect(hits).toContainText('stdout:1:1');
});

test('output search is ephemeral and never copies output into shared URLs', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: 'Run code' }).click();
  await expect(page.locator('.stdout')).toContainText('Hello from Scarp!', { timeout: 30_000 });
  await page.getByRole('button', { name: 'Find in output' }).click();
  const panel = page.getByRole('region', { name: 'Search captured program output' });
  await panel.getByLabel('Literal output text').fill('PRIVATE_INPUT_QUERY');
  await panel.getByRole('button', { name: 'Find output matches' }).click();
  await expect(panel.getByLabel('Output search summary')).toContainText('0 match(es)');
  const before = await page.evaluate(() => ({
    hash: window.location.hash,
    local: JSON.stringify(Object.entries(window.localStorage)),
  }));
  expect(JSON.stringify(before)).not.toContain('PRIVATE_INPUT_QUERY');
  await page.reload();
  await expect(page.getByRole('button', { name: 'Find in output' })).toBeDisabled();
});

test('the Output search is available through the command palette after a Run', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: 'Run code' }).click();
  await expect(page.locator('.stdout')).toContainText('Hello', { timeout: 30_000 });
  await page.keyboard.press('Control+Shift+P');
  const palette = page.getByRole('dialog', { name: 'Command palette' });
  await palette.getByRole('combobox', { name: 'Search commands' }).fill('Find in output');
  await palette.getByRole('option', { name: /Find in output/ }).click();
  await expect(page.getByRole('region', { name: 'Search captured program output' })).toBeVisible();
});
