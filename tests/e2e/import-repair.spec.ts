import { expect, test } from '@playwright/test';

function projectLink(mainSource: string, extraFiles: Record<string, string> = {}) {
  const envelope = {
    format: 'scarp-playground-workspace', version: 1,
    workspace: {
      entry: 'main.srp',
      files: {
        'main.srp': mainSource,
        'lib/math.srp': 'pub bind answer = 42;',
        ...extraFiles,
      },
    },
    activeFile: 'main.srp',
  };
  return './#project=' + encodeURIComponent(JSON.stringify(envelope));
}

test('missing import repair shows a preview and applies only an explicitly selected target', async ({ page }) => {
  const original = 'import "missing/math.srp" as math;\nprint(math.answer);\n';
  await page.goto(projectLink(original));
  await page.getByRole('button', { name: 'Repair imports' }).click();
  const panel = page.getByRole('region', { name: 'Missing import repair' });
  await expect(panel).toBeVisible();
  await expect(panel.getByLabel('Import repair summary')).toContainText('1 missing import(s)');
  await expect(panel.getByRole('button', { name: 'Preview selected repairs' })).toBeDisabled();

  await panel.getByLabel('Target for missing import in main.srp line 1')
    .selectOption('lib/math.srp');
  await expect(panel.getByLabel('Import repair summary')).toContainText('1 selected repair(s)');
  await panel.getByRole('button', { name: 'Preview selected repairs' }).click();
  const review = panel.getByLabel('Reviewed import repairs');
  await expect(review).toContainText('import(s) across 1 file(s)');
  await expect(review.getByLabel('Before import repair in main.srp'))
    .toContainText('missing/math.srp');
  await expect(review.getByLabel('After import repair in main.srp'))
    .toContainText('lib/math.srp');

  page.once('dialog', dialog => void dialog.accept());
  await review.getByRole('button', { name: 'Apply reviewed import repairs' }).click();
  await expect(panel).not.toBeVisible();
  await page.getByRole('button', { name: 'Run code' }).click();
  await expect(page.locator('.stdout')).toHaveText('42\n', { timeout: 30_000 });
});

test('one-step bulk undo restores every original import after an applied repair', async ({ page }) => {
  const original = 'import "lost/math.srp" as math;\nprint(math.answer);\n';
  await page.goto(projectLink(original));
  await page.getByRole('button', { name: 'Repair imports' }).click();
  const panel = page.getByRole('region', { name: 'Missing import repair' });
  await panel.getByLabel('Target for missing import in main.srp line 1')
    .selectOption('lib/math.srp');
  await panel.getByRole('button', { name: 'Preview selected repairs' }).click();
  page.once('dialog', dialog => void dialog.accept());
  await panel.getByRole('button', { name: 'Apply reviewed import repairs' }).click();
  await expect(page.getByRole('button', { name: 'Undo bulk change' })).toBeEnabled();
  await page.getByRole('button', { name: 'Undo bulk change' }).click();

  await page.getByRole('button', { name: 'Repair imports' }).click();
  await expect(panel.getByLabel('Import repair summary')).toContainText('1 missing import(s)');
  await expect(panel).toContainText('lost/math.srp');
});

test('no import path is modified by opening a panel or preview alone', async ({ page }) => {
  const original = 'import "missing/math.srp" as math;\nprint(42);\n';
  await page.goto(projectLink(original));
  await page.getByRole('button', { name: 'Repair imports' }).click();
  const panel = page.getByRole('region', { name: 'Missing import repair' });
  await panel.getByLabel('Target for missing import in main.srp line 1')
    .selectOption('lib/math.srp');
  await panel.getByRole('button', { name: 'Preview selected repairs' }).click();
  await panel.getByRole('button', { name: 'Close import repair' }).click();
  await page.getByRole('button', { name: 'Repair imports' }).click();
  await expect(panel.getByLabel('Import repair summary')).toContainText('1 missing import(s)');
});

test('import repair does not guess targets for unsupported import syntax', async ({ page }) => {
  const original = 'import "\\u{61}.srp" as fake;\nprint(1);\n';
  await page.goto(projectLink(original));
  await page.getByRole('button', { name: 'Repair imports' }).click();
  const panel = page.getByRole('region', { name: 'Missing import repair' });
  await expect(panel.getByLabel('Import repair summary'))
    .toContainText('1 unsupported import spelling(s)');
  await expect(panel.getByRole('button', { name: 'Preview selected repairs' })).toBeDisabled();
});

test('repair tool is available through the command palette on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('./');
  await page.keyboard.press('Control+Shift+P');
  const palette = page.getByRole('dialog', { name: 'Command palette' });
  await palette.getByRole('combobox', { name: 'Search commands' }).fill('Repair missing imports');
  await palette.getByRole('option', { name: /Repair missing imports/ }).click();
  await expect(page.getByRole('region', { name: 'Missing import repair' })).toBeVisible();
});
