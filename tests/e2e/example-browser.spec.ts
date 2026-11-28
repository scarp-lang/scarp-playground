import { expect, test } from '@playwright/test';
import { chooseExample, loadExample } from './support/example-switch';

const picker = (page: import('@playwright/test').Page) => page.getByRole('combobox', { name: 'Choose an example' });
const options = (page: import('@playwright/test').Page) => picker(page).locator('option:not([value=""])');

test('filter examples by compiler version and open the original matching program', async ({ page }) => {
  await page.goto('./');
  const filter = page.getByRole('searchbox', { name: 'Find an example' });
  await expect(filter).toBeVisible();
  await filter.fill('alpha.14');
  await expect(options(page)).toHaveCount(2);
  await expect(page.locator('.example-filter-count')).toHaveText(/2 of \d+ examples/);
  await loadExample(page, 'Ordered string-map projections');
  await page.getByRole('button', { name: 'Verify code' }).click();
  await expect(page.locator('.terminal-output')).toContainText('Static verification passed', { timeout: 30_000 });
});

test('searches descriptions, explains empty results and clears with button or Escape', async ({ page }) => {
  await page.goto('./');
  const filter = page.getByRole('searchbox', { name: 'Find an example' });
  const select = picker(page);
  const load = page.getByRole('button', { name: 'Load example', exact: true });
  await expect(select).toBeVisible();
  const allCount = await options(page).count();
  expect(allCount).toBeGreaterThan(40);
  await expect(load).toBeDisabled();
  await filter.fill('tuple alpha.14');
  await expect(options(page)).toHaveCount(1);
  await expect(options(page).first()).toHaveText('Nested pattern matching');
  await chooseExample(page, 'Nested pattern matching');
  await expect(load).toBeEnabled();
  await filter.fill('nothing_matches_this_example');
  await expect(options(page)).toHaveCount(0);
  await expect(select).toBeDisabled();
  await expect(load).toBeDisabled();
  await expect(page.getByText(/No examples match your search/)).toBeVisible();
  await page.getByRole('button', { name: 'Clear example filter' }).click();
  await expect(options(page)).toHaveCount(allCount);
  await expect(select).toHaveValue('');
  await filter.fill('alpha.12');
  await expect(options(page)).toHaveCount(6);
  await filter.press('Escape');
  await expect(filter).toHaveValue('');
  await expect(options(page)).toHaveCount(allCount);
});

test('switches untouched examples without prompting, but protects edited work on cancel', async ({ page }) => {
  await page.goto('./');
  await loadExample(page, 'Bindings & arithmetic');
  await expect(page.locator('.monaco-editor .view-lines')).toContainText('bind width = 6');
  const editor = page.locator('.monaco-editor textarea.inputarea');
  await editor.focus();
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.insertText('print("unsaved work");');
  await expect(page.locator('.monaco-editor .view-lines')).toContainText('unsaved work');
  // Browsing by keyboard or selecting an option must never replace code.
  await chooseExample(page, 'While loops');
  await expect(page.locator('.monaco-editor .view-lines')).toContainText('unsaved work');
  const load = page.getByRole('button', { name: 'Load example', exact: true });
  const dismiss = page.waitForEvent('dialog').then(async dialog => {
    expect(dialog.message()).toContain('Current source edits and program input will be lost');
    await dialog.dismiss();
  });
  await load.click();
  await dismiss;
  await expect(page.locator('.monaco-editor .view-lines')).toContainText('unsaved work');
  const accept = page.waitForEvent('dialog').then(dialog => dialog.accept());
  await load.click();
  await accept;
  await expect(page.locator('.monaco-editor .view-lines')).toContainText('var index = 0');
});

test('protects modified stdin even when the sample sources are unchanged', async ({ page }) => {
  await page.goto('./');
  await loadExample(page, 'Input with fallback');
  const input = page.getByRole('textbox', { name: /program input/i });
  await input.fill('my personal input\n');
  await chooseExample(page, 'Hello, Scarp');
  await expect(input).toHaveValue('my personal input\n');
  const dismiss = page.waitForEvent('dialog').then(async dialog => {
    expect(dialog.message()).toContain('program input will be lost');
    await dialog.dismiss();
  });
  await page.getByRole('button', { name: 'Load example', exact: true }).click();
  await dismiss;
  await expect(input).toHaveValue('my personal input\n');
});

for (const viewport of [{ width: 1440, height: 900 }, { width: 375, height: 812 }]) {
  test('example catalogue stays compact at ' + viewport.width + 'px', async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto('./');
    const select = picker(page);
    await expect(select).toBeVisible();
    await expect(page.locator('.monaco-editor textarea.inputarea')).toBeAttached();
    await expect(page.locator('.example-button, .example-list')).toHaveCount(0);
    expect(await options(page).count()).toBeGreaterThan(40);
    const before = await page.locator('.example-browser').boundingBox();
    expect(before?.height).toBeLessThan(320);
    await chooseExample(page, 'BigInt sequences and number theory');
    const after = await page.locator('.example-browser').boundingBox();
    expect(after?.height).toBeLessThan(420);
    expect(await page.locator('body').evaluate(element => element.scrollWidth)).toBeLessThanOrEqual(viewport.width);
    if (viewport.width > 760) {
      const area = await page.locator('.workspace-area').boundingBox();
      const layout = await page.locator('.layout').boundingBox();
      expect(area && layout && Math.abs((area.y + area.height) - (layout.y + layout.height))).toBeLessThan(2);
      // The sidebar catalogue must not introduce a huge blank scroll region.
      expect(await page.locator('body').evaluate(element => element.scrollHeight)).toBeLessThan(2200);
    }
  });
}
