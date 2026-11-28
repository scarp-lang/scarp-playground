import { expect, test } from '@playwright/test';

test('tagged source comments are counted and filterable without matching strings', async ({ page }) => {
  const source = '// TODO: improve entry\n' +
    'print("// FIXME not a real comment");\n' +
    '// FIXME: repair input edge case\n';
  await page.goto('./#code=' + encodeURIComponent(source));
  await page.getByRole('button', { name: 'Source tasks', exact: true }).click();
  const panel = page.getByRole('region', { name: 'Source task explorer' });
  await expect(panel).toBeVisible();
  await expect(panel.getByLabel('Source task summary')).toContainText('2 tagged comments');
  await expect(panel.getByLabel('Source task summary')).toContainText('1 urgent');

  await panel.getByLabel('Tag').selectOption('FIXME');
  await expect(panel.getByRole('button', { name: /Open FIXME in main.srp line 3/ })).toBeVisible();
  await expect(panel.getByText('improve entry')).toHaveCount(0);
  await panel.getByLabel('Tag').selectOption('all');
  await panel.getByLabel('Find task').fill('REPAIR');
  await expect(panel.getByRole('button', { name: /Open FIXME in main.srp line 3/ })).toBeVisible();
  await expect(panel.getByRole('button', { name: /Open TODO in main.srp line 1/ })).toHaveCount(0);
});

test('reviewing a task changes only the in-memory review filter', async ({ page }) => {
  await page.goto('./#code=' + encodeURIComponent('// TODO: add tests\n// FIXME: investigate\n'));
  await page.getByRole('button', { name: 'Source tasks', exact: true }).click();
  const panel = page.getByRole('region', { name: 'Source task explorer' });
  await expect(panel.getByLabel('Source task summary')).toContainText('0 reviewed');

  const first = panel.locator('.source-task-item').filter({ hasText: 'add tests' });
  await first.getByRole('checkbox', { name: 'Reviewed' }).check();
  await expect(panel.getByLabel('Source task summary')).toContainText('1 reviewed');
  await panel.getByLabel('Review status').selectOption('reviewed');
  await expect(panel.locator('.source-task-item')).toHaveCount(1);
  await panel.getByRole('button', { name: 'Clear review flags' }).click();
  await expect(panel.locator('.source-task-item')).toHaveCount(0);
  await panel.getByLabel('Review status').selectOption('all');
  await expect(panel.locator('.source-task-item')).toHaveCount(2);
});

test('clicking a comment location navigates to the source editor', async ({ page }) => {
  const source = 'print(1);\nprint(2);\n// TODO: examine final statement\n';
  await page.goto('./#code=' + encodeURIComponent(source));
  await page.getByRole('button', { name: 'Source tasks', exact: true }).click();
  const panel = page.getByRole('region', { name: 'Source task explorer' });
  await panel.getByRole('button', { name: /Open TODO in main.srp line 3/ }).click();
  await expect(page.locator('.monaco-editor textarea.inputarea')).toBeAttached();
  await expect(page.locator('.monaco-editor')).toBeVisible();
});

test('source task review stays out of the URL and browser persistent storage', async ({ page }) => {
  await page.goto('./#code=' + encodeURIComponent('// TODO: LOCAL_ONLY_TASK\n'));
  await page.getByRole('button', { name: 'Source tasks', exact: true }).click();
  const panel = page.getByRole('region', { name: 'Source task explorer' });
  await panel.getByRole('checkbox', { name: 'Reviewed' }).check();
  const before = await page.evaluate(() => ({
    hash: window.location.hash,
    storage: Object.entries(window.localStorage),
  }));
  expect(JSON.stringify(before.storage)).not.toContain('LOCAL_ONLY_TASK');
  expect(before.hash).not.toContain('reviewed');
  await page.reload();
  await page.getByRole('button', { name: 'Source tasks', exact: true }).click();
  await expect(panel.getByLabel('Source task summary')).toContainText('0 reviewed');
});

test('source task explorer can be opened from the keyboard command palette', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('./');
  await page.keyboard.press('Control+Shift+P');
  const palette = page.getByRole('dialog', { name: 'Command palette' });
  await palette.getByRole('combobox', { name: 'Search commands' }).fill('Source tasks and review');
  await palette.getByRole('option', { name: /Source tasks and review/ }).click();
  await expect(page.getByRole('region', { name: 'Source task explorer' })).toBeVisible();
});
