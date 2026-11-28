import { expect, test } from '@playwright/test';

test('source hygiene scans the open source and applies only reviewed fixes', async ({ page }) => {
  const original = 'bind answer = 42;  \nprint(answer);';
  await page.goto('./#code=' + encodeURIComponent(original));
  const toggle = page.getByRole('button', { name: 'Source hygiene', exact: true });
  await toggle.click();
  const panel = page.getByRole('region', { name: 'Source hygiene inspector' });
  await expect(panel).toBeVisible();
  await expect(panel.getByRole('status', { name: 'Source hygiene summary' }))
    .toContainText('Safe fixes: 2');
  await panel.getByRole('button', { name: 'Preview safe cleanup' }).click();
  await expect(panel.getByLabel('Safe source cleanup diff')).toContainText('bind answer');
  page.once('dialog', dialog => void dialog.accept());
  await panel.getByRole('button', { name: 'Apply reviewed cleanup' }).click();
  await expect(panel).not.toBeVisible();
  await expect(page.getByText(/Applied reviewed source cleanup/)).toBeVisible();
  await toggle.click();
  await expect(panel.getByText('No safely fixable source hygiene findings.')).toBeVisible();
  await panel.getByRole('button', { name: 'Close source hygiene' }).click();
  await page.getByRole('button', { name: 'Undo bulk change' }).click();
  await toggle.click();
  await expect(panel.getByRole('status', { name: 'Source hygiene summary' }))
    .toContainText('Safe fixes: 2');
});

test('a suspicious invisible Unicode character requires manual review', async ({ page }) => {
  await page.goto('./#code=' + encodeURIComponent('print("safe\u202Eunsafe");\n'));
  await page.getByRole('button', { name: 'Source hygiene', exact: true }).click();
  const panel = page.getByRole('region', { name: 'Source hygiene inspector' });
  await expect(panel.getByRole('status', { name: 'Source hygiene summary' }))
    .toContainText('Security: 1');
  await expect(panel.getByText('Bidirectional text control can disguise source-code reading order.'))
    .toBeVisible();
  await expect(panel.getByRole('button', { name: 'Preview safe cleanup' })).toBeDisabled();
  await panel.getByRole('button', { name: /Open main.srp line 1 column/ }).click();
  await expect(page.locator('.monaco-editor')).toBeVisible();
});

test('source hygiene is available through the command palette and filters findings', async ({ page }) => {
  await page.goto('./#code=' + encodeURIComponent('bind n = 1; \n'));
  await page.keyboard.press('Control+Shift+P');
  const palette = page.getByRole('dialog', { name: 'Command palette' });
  await expect(palette).toBeVisible();
  await palette.getByRole('combobox', { name: 'Search commands' }).fill('Source hygiene');
  await palette.getByRole('option', { name: /Source hygiene and Unicode safety/ }).click();
  const panel = page.getByRole('region', { name: 'Source hygiene inspector' });
  await expect(panel).toBeVisible();
  await panel.getByLabel('Severity').selectOption('security');
  await expect(panel.getByText('No findings match these filters.')).toBeVisible();
  await panel.getByLabel('Severity').selectOption('all');
  await expect(panel.getByText('Whitespace after the final non-whitespace character.')).toBeVisible();
});
