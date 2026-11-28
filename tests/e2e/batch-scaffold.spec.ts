import { expect, test } from '@playwright/test';

function projectLink(source: string, other = 'pub bind answer = 42;\n') {
  return './#project=' + encodeURIComponent(JSON.stringify({
    format: 'scarp-playground-workspace',
    version: 1,
    workspace: {
      entry: 'main.srp', files: {
        'main.srp': source, 'lib/math.srp': other,
      },
    }, activeFile: 'main.srp',
  }));
}

async function openScaffold(page: import('@playwright/test').Page) {
  await page.getByRole('button', { name: 'Commands', exact: true }).click();
  const palette = page.getByRole('dialog', { name: 'Command palette' });
  await palette.getByRole('combobox', { name: 'Search commands' }).fill('Batch source scaffold');
  await palette.getByRole('option', { name: /Batch source scaffold/ }).click();
  const panel = page.getByRole('region', { name: 'Batch source scaffold' });
  await expect(panel).toBeVisible();
  return panel;
}

test('creates two new files with explicit preview, then undo removes both atomically', async ({ page }) => {
  await page.goto(projectLink('print(42);\n'));
  const panel = await openScaffold(page);
  await panel.getByLabel('New relative .srp path').fill('lib/first.srp');
  await panel.getByRole('button', { name: 'Add another new file' }).click();
  await panel.getByLabel('New relative .srp path').nth(1).fill('lib/second.srp');
  await panel.getByLabel('Source template').nth(1).selectOption('empty');
  await panel.getByRole('button', { name: 'Preview batch file creation' }).click();

  const review = panel.getByLabel('Scaffold addition preview');
  await expect(review).toContainText('2 additions');
  await expect(review).toContainText('lib/first.srp');
  await expect(review).toContainText('lib/second.srp');
  page.once('dialog', dialog => void dialog.accept());
  await review.getByRole('button', { name: 'Apply reviewed batch scaffold' }).click();
  await expect(panel).not.toBeVisible();

  await page.getByRole('button', { name: 'Undo bulk change' }).click();
  const reopened = await openScaffold(page);
  await expect(reopened.getByLabel('Batch scaffold summary')).toContainText('2 existing Scarp files');
});

test('previewing batch creation alone never mutates the workspace', async ({ page }) => {
  await page.goto(projectLink('print(5);\n'));
  const panel = await openScaffold(page);
  await panel.getByLabel('New relative .srp path').fill('src/preview_only.srp');
  await panel.getByRole('button', { name: 'Preview batch file creation' }).click();
  await expect(panel.getByLabel('Scaffold addition preview')).toContainText('preview_only.srp');
  await panel.getByRole('button', { name: 'Close batch scaffold' }).click();
  await page.getByRole('button', { name: 'Run code' }).click();
  await expect(page.locator('.stdout')).toHaveText('5\n', { timeout: 30_000 });
});

test('duplicate or unsafe relative paths are rejected with no partial creation', async ({ page }) => {
  await page.goto(projectLink('print(1);'));
  const panel = await openScaffold(page);
  await panel.getByLabel('New relative .srp path').fill('main.srp');
  await panel.getByRole('button', { name: 'Preview batch file creation' }).click();
  await expect(panel.getByRole('alert')).toContainText('duplicate');
  await panel.getByLabel('New relative .srp path').fill('../escape.srp');
  await panel.getByRole('button', { name: 'Preview batch file creation' }).click();
  await expect(panel.getByRole('alert')).toContainText('invalid');
  await expect(panel.getByLabel('Batch scaffold summary')).toContainText('2 existing Scarp files');
});

test('custom source and clone requests remain separate from the original file', async ({ page }) => {
  await page.goto(projectLink('print(10);\n'));
  const panel = await openScaffold(page);
  await panel.getByLabel('New relative .srp path').fill('lib/new_custom.srp');
  await panel.getByLabel('Source template').selectOption('custom');
  await panel.getByLabel('Source text (max 64 KiB)').fill('pub bind extra = 17;\n');
  await panel.getByRole('button', { name: 'Add another new file' }).click();
  await panel.getByLabel('New relative .srp path').nth(1).fill('lib/copy_math.srp');
  await panel.getByLabel('Source template').nth(1).selectOption('clone');
  await panel.getByLabel('Copy from existing file').selectOption('lib/math.srp');
  await panel.getByRole('button', { name: 'Preview batch file creation' }).click();
  const review = panel.getByLabel('Scaffold addition preview');
  await expect(review).toContainText('pub bind extra = 17');
  await expect(review).toContainText('pub bind answer = 42');
  await expect(review).toContainText('relative imports');
});

test('source scaffold remains reachable from a mobile keyboard command', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('./');
  await page.keyboard.press('Control+Shift+P');
  const palette = page.getByRole('dialog', { name: 'Command palette' });
  await palette.getByRole('combobox', { name: 'Search commands' }).fill('Batch source scaffold');
  await palette.getByRole('option', { name: /Batch source scaffold/ }).click();
  await expect(page.getByRole('region', { name: 'Batch source scaffold' })).toBeVisible();
});
