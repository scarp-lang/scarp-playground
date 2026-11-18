import { expect, test } from '@playwright/test';

test('filter examples by compiler version and open the original matching program', async ({ page }) => {
  await page.goto('./');
  const filter = page.getByRole('searchbox', { name: 'Find an example' });
  await expect(filter).toBeVisible();

  await filter.fill('alpha.14');
  await expect(page.locator('.example-button')).toHaveCount(2);
  await expect(page.locator('.example-filter-count')).toHaveText(/2 of \d+ examples/);
  await page.locator('.example-button').filter({
    has: page.getByText('Ordered string-map projections', { exact: true }),
  }).click();

  await page.getByRole('button', { name: 'Verify code' }).click();
  await expect(page.locator('.terminal-output')).toContainText('Static verification passed', {
    timeout: 30_000,
  });
});

test('searches descriptions, explains empty results and clears with button or Escape', async ({ page }) => {
  await page.goto('./');
  const filter = page.getByRole('searchbox', { name: 'Find an example' });
  const buttons = page.locator('.example-button');
  const allCount = await buttons.count();

  await filter.fill('tuple alpha.14');
  await expect(buttons).toHaveCount(1);
  await expect(buttons.first()).toContainText('Nested pattern matching');

  await filter.fill('nothing_matches_this_example');
  await expect(buttons).toHaveCount(0);
  await expect(page.getByText(/No examples match your search/)).toBeVisible();

  await page.getByRole('button', { name: 'Clear example filter' }).click();
  await expect(buttons).toHaveCount(allCount);

  await filter.fill('alpha.12');
  await expect(buttons).toHaveCount(6);
  await filter.press('Escape');
  await expect(filter).toHaveValue('');
  await expect(buttons).toHaveCount(allCount);
});

test('switches untouched examples without prompting, but protects edited work on cancel', async ({ page }) => {
  await page.goto('./');
  const target = page.locator('.example-button').filter({
    has: page.getByText('Bindings & arithmetic', { exact: true }),
  });
  // Ordinary browsing between unmodified official fixtures should be immediate.
  await target.click();
  await expect(page.locator('.monaco-editor .view-lines')).toContainText('bind width = 6');

  const editor = page.locator('.monaco-editor textarea.inputarea');
  await editor.focus();
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.insertText('print("unsaved work");');
  await expect(page.locator('.monaco-editor .view-lines')).toContainText('unsaved work');

  const next = page.locator('.example-button').filter({
    has: page.getByText('While loops', { exact: true }),
  });
  const dismiss = page.waitForEvent('dialog').then(async dialog => {
    expect(dialog.message()).toContain('Current source edits and program input will be lost');
    await dialog.dismiss();
  });
  await next.click();
  await dismiss;
  await expect(page.locator('.monaco-editor .view-lines')).toContainText('unsaved work');

  const accept = page.waitForEvent('dialog').then(async dialog => {
    await dialog.accept();
  });
  await next.click();
  await accept;
  await expect(page.locator('.monaco-editor .view-lines')).toContainText('var index = 0');
});

test('protects modified stdin even when the sample sources are unchanged', async ({ page }) => {
  await page.goto('./');
  await page.locator('.example-button').filter({
    has: page.getByText('Input with fallback', { exact: true }),
  }).click();
  const input = page.getByRole('textbox', { name: /program input/i });
  await expect(input).toBeVisible();
  await input.fill('my personal input\n');

  const next = page.locator('.example-button').filter({
    has: page.getByText('Hello, Scarp', { exact: true }),
  });
  const dismiss = page.waitForEvent('dialog').then(async dialog => {
    expect(dialog.message()).toContain('program input will be lost');
    await dialog.dismiss();
  });
  await next.click();
  await dismiss;
  await expect(input).toHaveValue('my personal input\n');
});
