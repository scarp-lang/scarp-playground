import { expect, test } from '@playwright/test';

async function goToLocation(page: import('@playwright/test').Page, target: string) {
  await page.getByRole('button', { name: 'Go to line' }).click();
  const dialog = page.getByRole('dialog', { name: 'Quick open Scarp file' });
  const input = dialog.getByRole('combobox', { name: 'Find .srp file' });
  await input.fill(target);
  await input.press('Enter');
  await expect(dialog).toHaveCount(0);
}

test('bookmarks current Monaco cursor, renames and deletes a source location', async ({ page }) => {
  const program = 'print("first");\nprint("second");\nprint("third");\n';
  await page.goto('./#code=' + encodeURIComponent(program));
  await expect(page.locator('.monaco-editor textarea.inputarea')).toBeAttached();
  await goToLocation(page, ':2:7');
  await page.getByRole('button', { name: 'Bookmarks', exact: true }).click();
  const panel = page.getByRole('region', { name: 'Source bookmarks and navigation' });
  await expect(panel).toBeVisible();
  await panel.getByLabel('Optional bookmark name').fill('Output location');
  await panel.getByRole('button', { name: 'Add at cursor' }).click();
  await expect(panel.getByRole('button', { name: /Open bookmark Output location at main.srp line 2 column 7/ }))
    .toBeVisible();
  await panel.getByRole('textbox', { name: 'Rename bookmark 1' }).fill('Second statement');
  await panel.getByRole('button', { name: 'Save name' }).click();
  await expect(panel.getByRole('button', { name: /Open bookmark Second statement/ })).toBeVisible();
  await panel.getByRole('button', { name: 'Delete bookmark Second statement' }).click();
  await expect(panel.getByText('No bookmarks yet. Place the editor cursor on a line and select Add at cursor.'))
    .toBeVisible();
});

test('Back and Forward restore navigated source locations', async ({ page }) => {
  const program = 'print("first");\nprint("second");\nprint("third");\n';
  await page.goto('./#code=' + encodeURIComponent(program));
  await expect(page.locator('.monaco-editor textarea.inputarea')).toBeAttached();
  await goToLocation(page, ':2:1');
  await goToLocation(page, ':3:1');
  const back = page.getByRole('button', { name: 'Navigate backward' }).first();
  const forward = page.getByRole('button', { name: 'Navigate forward' }).first();
  await expect(back).toBeEnabled();
  await back.click();
  await expect(forward).toBeEnabled();
  await forward.click();
  await page.getByRole('button', { name: 'Bookmarks', exact: true }).click();
  const panel = page.getByRole('region', { name: 'Source bookmarks and navigation' });
  await expect(panel.getByText(/previous location\(s\)/)).toBeVisible();
});

test('session bookmarks never persist to browser storage or a shared URL', async ({ page }) => {
  await page.goto('./#code=' + encodeURIComponent('print("hello");\n'));
  await expect(page.locator('.monaco-editor textarea.inputarea')).toBeAttached();
  await page.getByRole('button', { name: 'Bookmarks', exact: true }).click();
  const panel = page.getByRole('region', { name: 'Source bookmarks and navigation' });
  await panel.getByRole('button', { name: 'Add at cursor' }).click();
  await expect(panel.getByRole('button', { name: /Open bookmark main.srp:1/ })).toBeVisible();
  const before = await page.evaluate(() => ({
    hash: window.location.hash,
    local: Object.keys(window.localStorage).join(','),
  }));
  expect(before.hash).not.toContain('bookmark');
  expect(before.local).not.toContain('bookmark');
  await page.reload();
  await page.getByRole('button', { name: 'Bookmarks', exact: true }).click();
  await expect(panel.getByText('No bookmarks yet. Place the editor cursor on a line and select Add at cursor.'))
    .toBeVisible();
});

test('bookmark tool is accessible in the command palette on narrow screens', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('./');
  await page.keyboard.press('Control+Shift+P');
  const palette = page.getByRole('dialog', { name: 'Command palette' });
  await palette.getByRole('combobox', { name: 'Search commands' }).fill('Source bookmarks');
  await palette.getByRole('option', { name: /Source bookmarks/ }).click();
  await expect(page.getByRole('region', { name: 'Source bookmarks and navigation' })).toBeVisible();
  const width = await page.locator('body').evaluate(element => element.scrollWidth);
  expect(width).toBeLessThanOrEqual(375);
});
