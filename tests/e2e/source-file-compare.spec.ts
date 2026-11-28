import { expect, test } from '@playwright/test';

function link(left: string, right: string) {
  return './#project=' + encodeURIComponent(JSON.stringify({
    format: 'scarp-playground-workspace',
    version: 1,
    workspace: {
      entry: 'main.srp',
      files: {
        'main.srp': left,
        'lib/other.srp': right,
      },
    },
    activeFile: 'main.srp',
  }));
}

async function openComparison(page: import('@playwright/test').Page) {
  await page.getByRole('button', { name: 'Commands', exact: true }).click();
  const palette = page.getByRole('dialog', { name: 'Command palette' });
  await palette.getByRole('combobox', { name: 'Search commands' }).fill('Compare Scarp files');
  await palette.getByRole('option', { name: /Compare Scarp files/ }).click();
  const panel = page.getByRole('region', { name: 'Compare Scarp source files' });
  await expect(panel).toBeVisible();
  return panel;
}

test('two Scarp files are compared without changing or executing either one', async ({ page }) => {
  await page.goto(link('print(10);\n', 'print(20);\n'));
  const panel = await openComparison(page);
  await expect(panel.getByLabel('Left source')).toHaveValue('main.srp');
  await expect(panel.getByLabel('Right source')).toHaveValue('lib/other.srp');
  await panel.getByRole('button', { name: 'Compare selected source files' }).click();
  await expect(panel.getByLabel('Source file comparison summary')).toContainText('1 modified');
  await expect(panel.getByLabel('Left file comparison line 1')).toContainText('print(10)');
  await expect(panel.getByLabel('Right file comparison line 1')).toContainText('print(20)');

  await panel.getByRole('button', { name: 'Close source file comparison' }).click();
  await page.getByRole('button', { name: 'Run code' }).click();
  await expect(page.locator('.stdout')).toHaveText('10\n', { timeout: 30_000 });
});

test('line-ending-only differences can be excluded without changing files', async ({ page }) => {
  await page.goto(link('print(1);\r\n', 'print(1);\n'));
  const panel = await openComparison(page);
  await panel.getByRole('button', { name: 'Compare selected source files' }).click();
  await expect(panel.getByLabel('Source file comparison summary')).toContainText('1 modified');

  await panel.getByLabel('Ignore CRLF/LF/CR differences').check();
  await panel.getByRole('button', { name: 'Compare selected source files' }).click();
  await expect(panel).toContainText('no differences under the selected comparison rules');
});

test('source comparison offers navigation to both independent file buffers', async ({ page }) => {
  await page.goto(link('print(10);\n', 'print(20);\n'));
  const panel = await openComparison(page);
  await panel.getByRole('button', { name: 'Compare selected source files' }).click();
  await panel.getByRole('button', { name: 'Open right source line 1' }).click();
  await expect(page.getByRole('tab', { name: /other.srp/ })).toBeVisible();
  await expect(page.locator('.monaco-editor textarea.inputarea')).toBeAttached();
});

test('comparison displays a bounded error for oversized diff matrix', async ({ page }) => {
  const left = 'a\n'.repeat(1700);
  const right = 'b\n'.repeat(1700);
  await page.goto(link(left, right));
  const panel = await openComparison(page);
  await panel.getByRole('button', { name: 'Compare selected source files' }).click();
  await expect(panel.getByRole('alert')).toContainText('bounded diff matrix');
  await expect(panel.getByLabel('Source comparison hunks')).toHaveCount(0);
});

test('source comparison is reachable from mobile keyboard commands', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto(link('print(1);', 'print(2);'));
  await page.keyboard.press('Control+Shift+P');
  const palette = page.getByRole('dialog', { name: 'Command palette' });
  await palette.getByRole('combobox', { name: 'Search commands' }).fill('Compare Scarp files');
  await palette.getByRole('option', { name: /Compare Scarp files/ }).click();
  const panel = page.getByRole('region', { name: 'Compare Scarp source files' });
  await expect(panel).toBeVisible();
  await panel.getByLabel('Unchanged context lines').selectOption('0');
  await panel.getByRole('button', { name: 'Compare selected source files' }).click();
  await expect(panel.getByLabel('Source file comparison summary')).toContainText('1 modified');
});
