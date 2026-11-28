import { expect, test } from '@playwright/test';

test('advanced source search supports exact quoted phrases and exclusions', async ({ page }) => {
  const source = 'bind answer = 1;\n// TODO: temporary\nprint(answer);\n// TODO: permanent\n';
  await page.goto('./#code=' + encodeURIComponent(source));
  await page.getByRole('button', { name: 'Advanced search', exact: true }).click();
  const panel = page.getByRole('region', { name: 'Advanced source search' });
  await expect(panel).toBeVisible();

  await panel.getByLabel('Literal search expression').fill('TODO -temporary OR "bind answer"');
  await panel.getByRole('button', { name: 'Search sources' }).click();
  await expect(panel.getByLabel('Advanced search summary')).toContainText('2 result(s)');
  const found = panel.getByLabel('Advanced source results');
  await expect(found.getByRole('button', { name: /Open match in main.srp line 1/ })).toBeVisible();
  await expect(found.getByRole('button', { name: /Open match in main.srp line 4/ })).toBeVisible();
  await expect(found).not.toContainText('temporary');
});

test('advanced search honors whole-word and case matching switches', async ({ page }) => {
  await page.goto('./#code=' + encodeURIComponent('Foo foobar foo\nFOO\n'));
  await page.getByRole('button', { name: 'Advanced search', exact: true }).click();
  const panel = page.getByRole('region', { name: 'Advanced source search' });
  await panel.getByLabel('Literal search expression').fill('foo');
  await panel.getByLabel('Match case').check();
  await panel.getByLabel('Whole words').check();
  await panel.getByRole('button', { name: 'Search sources' }).click();
  await expect(panel.getByLabel('Advanced search summary')).toContainText('1 result(s)');
  await panel.getByLabel('Match case').uncheck();
  await panel.getByRole('button', { name: 'Search sources' }).click();
  await expect(panel.getByLabel('Advanced search summary')).toContainText('3 result(s)');
});

test('invalid quoted terms display a parse error without affecting Run', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: 'Advanced search', exact: true }).click();
  const panel = page.getByRole('region', { name: 'Advanced source search' });
  await panel.getByLabel('Literal search expression').fill('"unclosed');
  await panel.getByRole('button', { name: 'Search sources' }).click();
  await expect(panel.getByRole('alert')).toContainText('Close every quoted phrase');
  await panel.getByLabel('Literal search expression').fill('print');
  await panel.getByRole('button', { name: 'Search sources' }).click();
  await expect(panel.getByLabel('Advanced search summary')).toContainText('result(s)');
});

test('matching source line opens a valid editor coordinate', async ({ page }) => {
  await page.goto('./#code=' + encodeURIComponent('print(1);\nprint(2);\n'));
  await page.getByRole('button', { name: 'Advanced search', exact: true }).click();
  const panel = page.getByRole('region', { name: 'Advanced source search' });
  await panel.getByLabel('Literal search expression').fill('print');
  await panel.getByRole('button', { name: 'Search sources' }).click();
  await panel.getByRole('button', { name: /Open match in main.srp line 2/ }).click();
  await expect(page.locator('.monaco-editor textarea.inputarea')).toBeAttached();
});

test('advanced search opens via accessible keyboard command palette', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('./');
  await page.keyboard.press('Control+Shift+P');
  const palette = page.getByRole('dialog', { name: 'Command palette' });
  await palette.getByRole('combobox', { name: 'Search commands' }).fill('Advanced source search');
  await palette.getByRole('option', { name: /Advanced source search/ }).click();
  await expect(page.getByRole('region', { name: 'Advanced source search' })).toBeVisible();
});
