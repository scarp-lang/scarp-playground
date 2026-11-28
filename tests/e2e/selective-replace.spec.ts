import { expect, test } from '@playwright/test';

function workspaceLink(main: string, helper = 'pub bind alpha = 1;\n') {
  return './#project=' + encodeURIComponent(JSON.stringify({
    format: 'scarp-playground-workspace',
    version: 1,
    workspace: {
      entry: 'main.srp',
      files: { 'main.srp': main, 'lib/help.srp': helper },
    },
    activeFile: 'main.srp',
  }));
}

async function openSelectiveReplace(page: import('@playwright/test').Page) {
  await page.getByRole('button', { name: 'Commands', exact: true }).click();
  const palette = page.getByRole('dialog', { name: 'Command palette' });
  await palette.getByRole('combobox', { name: 'Search commands' })
    .fill('Selective replace');
  await palette.getByRole('option', { name: /Selective replace/ }).click();
  const panel = page.getByRole('region', { name: 'Selective replace' });
  await expect(panel).toBeVisible();
  return panel;
}

test('select only one literal occurrence and undo the atomic workspace change', async ({ page }) => {
  await page.goto(workspaceLink('print("alpha alpha");\n'));
  const panel = await openSelectiveReplace(page);
  await panel.getByLabel('Find text').fill('alpha');
  await panel.getByLabel('Replace with').fill('beta');
  await expect(panel.getByLabel('Selective replace summary')).toContainText('3 matching occurrence(s)');
  const item = panel.getByRole('checkbox', { name: /Replace match in main.srp line 1 column 14/ });
  await item.check();
  await panel.getByRole('button', { name: 'Preview 1 selected replacement(s)' }).click();
  const review = panel.getByLabel('Selective replacement preview');
  await expect(review).toContainText('2 matching occurrence(s) left untouched');
  await expect(review.getByLabel('Replaced source line main.srp:1')).toHaveText('print("alpha beta");');
  page.once('dialog', dialog => void dialog.accept());
  await review.getByRole('button', { name: 'Apply reviewed selective replacements' }).click();
  await expect(panel).not.toBeVisible();

  await page.getByRole('button', { name: 'Undo bulk change' }).click();
  const again = await openSelectiveReplace(page);
  await again.getByLabel('Find text').fill('alpha');
  await expect(again.getByLabel('Selective replace summary'))
    .toContainText('3 matching occurrence(s)');
});

test('preview never modifies source until explicitly applied', async ({ page }) => {
  await page.goto(workspaceLink('print("alpha");\n'));
  const panel = await openSelectiveReplace(page);
  await panel.getByLabel('Find text').fill('alpha');
  await panel.getByLabel('Replace with').fill('beta');
  await panel.getByRole('button', { name: 'Select all matches' }).click();
  await panel.getByRole('button', { name: /Preview 2 selected replacement/ }).click();
  await expect(panel.getByLabel('Selective replacement preview')).toContainText('beta');
  await panel.getByRole('button', { name: 'Close selective replace' }).click();

  await page.getByRole('button', { name: 'Run code' }).click();
  await expect(page.locator('.stdout')).toHaveText('alpha\n', { timeout: 30_000 });
});

test('case, word and scope filters constrain selectable occurrences', async ({ page }) => {
  await page.goto(workspaceLink('print("Alpha alpha alphabet");\n'));
  const panel = await openSelectiveReplace(page);
  await panel.getByLabel('Find text').fill('alpha');
  await expect(panel.getByLabel('Selective replace summary')).toContainText('4 matching occurrence(s)');
  await panel.getByLabel('Match case').check();
  await panel.getByLabel('Whole words').check();
  await panel.getByLabel('Search scope').selectOption('main.srp');
  await expect(panel.getByLabel('Selective replace summary')).toContainText('1 matching occurrence(s)');
  await expect(panel.getByLabel('Selectable source matches')).toContainText('main.srp');
});

test('explicit deletion requires confirmation and does not change other files', async ({ page }) => {
  await page.goto(workspaceLink('print("alpha-alpha");\n'));
  const panel = await openSelectiveReplace(page);
  await panel.getByLabel('Find text').fill('alpha');
  await panel.getByRole('checkbox', { name: /Replace match in main.srp line 1 column 14/ }).check();
  await panel.getByRole('button', { name: /Preview 1 selected replacement/ }).click();
  page.once('dialog', dialog => void dialog.accept());
  await panel.getByRole('button', { name: 'Apply reviewed selective replacements' }).click();
  await page.getByRole('button', { name: 'Run code' }).click();
  await expect(page.locator('.stdout')).toHaveText('alpha-\n', { timeout: 30_000 });
});

test('long ambiguous matches cannot be applied while result enumeration is incomplete', async ({ page }) => {
  const repeated = 'alpha '.repeat(170);
  await page.goto(workspaceLink('// ' + repeated));
  const panel = await openSelectiveReplace(page);
  await panel.getByLabel('Find text').fill('alpha');
  await expect(panel.getByLabel('Selective replace summary')).toContainText('160 matching occurrence(s)');
  await expect(panel.getByText(/More than 160 occurrences/)).toBeVisible();
  await expect(panel.getByRole('button', { name: 'Select all matches' })).toBeDisabled();
  await expect(panel.getByRole('button', { name: /Preview/ })).toBeDisabled();
});
