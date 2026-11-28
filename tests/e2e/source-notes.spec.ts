import { expect, test } from '@playwright/test';

test('source notes can be created, resolved and edited without changing Scarp code', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: 'Source notes', exact: true }).click();
  const panel = page.getByRole('region', { name: 'Session source notes' });
  await expect(panel).toBeVisible();

  await panel.getByLabel('Note title').fill('Investigate greeting');
  await panel.getByLabel('Private note text').fill('Why does this print hello?');
  await panel.getByRole('button', { name: 'Add source note' }).click();
  await expect(panel.getByLabel('Source notes summary')).toContainText('1/32 notes');
  await expect(panel.getByText('Investigate greeting', { exact: true })).toBeVisible();

  await panel.getByRole('button', { name: 'Resolve source note Investigate greeting' }).click();
  await expect(panel.getByLabel('Source notes summary')).toContainText('1 resolved');
  await panel.getByRole('button', { name: 'Edit source note Investigate greeting' }).click();
  await panel.getByLabel('Note title').fill('Updated learning note');
  await panel.getByLabel('Private note text').fill('Reviewed explanation');
  await panel.getByRole('button', { name: 'Save note changes' }).click();
  await expect(panel.getByText('Reviewed explanation')).toBeVisible();
  await panel.getByRole('button', { name: 'Reopen source note Updated learning note' }).click();
  await expect(panel.getByLabel('Source notes summary')).toContainText('0 resolved');
});

test('annotations validate source locations before creating and navigating', async ({ page }) => {
  await page.goto('./#code=' + encodeURIComponent('print(1);\nprint(2);\n'));
  await page.getByRole('button', { name: 'Source notes', exact: true }).click();
  const panel = page.getByRole('region', { name: 'Session source notes' });

  await panel.getByLabel('Line', { exact: true }).fill('999');
  await panel.getByLabel('Note title').fill('Last statement');
  await panel.getByRole('button', { name: 'Add source note' }).click();
  await expect(panel).toContainText('Select an existing Scarp source location.');

  await panel.getByLabel('Line', { exact: true }).fill('2');
  await panel.getByLabel('Column', { exact: true }).fill('3');
  await panel.getByRole('button', { name: 'Add source note' }).click();
  await expect(panel.getByRole('button', { name: 'Open source note Last statement' })).toBeVisible();
  await panel.getByRole('button', { name: 'Open source note Last statement' }).click();
  await expect(page.locator('.monaco-editor textarea.inputarea')).toBeAttached();
});

test('notes stay in tab memory when the panel closes but not after a reload', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: 'Source notes', exact: true }).click();
  const panel = page.getByRole('region', { name: 'Session source notes' });
  await panel.getByLabel('Note title').fill('Private question');
  await panel.getByLabel('Private note text').fill('DO_NOT_EXPORT_THIS_NOTE');
  await panel.getByRole('button', { name: 'Add source note' }).click();
  await panel.getByRole('button', { name: 'Close source notes' }).click();

  await page.getByRole('button', { name: 'Source notes', exact: true }).click();
  await expect(panel.getByText('DO_NOT_EXPORT_THIS_NOTE')).toBeVisible();
  const before = await page.evaluate(() => ({
    hash: window.location.hash, storage: Object.values(window.localStorage),
  }));
  expect(JSON.stringify(before)).not.toContain('DO_NOT_EXPORT_THIS_NOTE');
  await page.reload();
  await page.getByRole('button', { name: 'Source notes', exact: true }).click();
  await expect(panel.getByText('No source notes saved in this tab.')).toBeVisible();
});

test('source notes are reachable from the keyboard command palette', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('./');
  await page.keyboard.press('Control+Shift+P');
  const palette = page.getByRole('dialog', { name: 'Command palette' });
  await palette.getByRole('combobox', { name: 'Search commands' }).fill('Session source notes');
  await palette.getByRole('option', { name: /Session source notes/ }).click();
  await expect(page.getByRole('region', { name: 'Session source notes' })).toBeVisible();
});
