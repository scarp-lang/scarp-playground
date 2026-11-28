import { expect, test } from '@playwright/test';

test('saves, reopens, renames and removes a source-only snapshot without replacing ordinary autosave', async ({ page }) => {
  await page.goto('./#code=' + encodeURIComponent('print("library source");'));
  const stdin = page.getByRole('textbox', { name: /program input/i });
  await stdin.fill('not stored in named snapshot');
  await page.getByRole('button', { name: 'Project library', exact: true }).click();
  const panel = page.getByRole('region', { name: 'Local project library' });
  await expect(panel.getByLabel('New snapshot name')).toBeVisible();
  await panel.getByLabel('New snapshot name').fill('Practice');
  await panel.getByRole('button', { name: 'Save named snapshot' }).click();
  await expect(panel).toContainText('Saved source snapshot "Practice".');
  await page.getByRole('button', { name: 'Save locally' }).click();
  const editor = page.locator('.monaco-editor textarea.inputarea');
  await editor.focus();
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.insertText('print("separate autosave");');
  await page.reload();
  await expect(page.locator('.monaco-editor .view-lines')).toContainText('separate autosave');
  await page.getByRole('button', { name: 'Project library', exact: true }).click();
  await panel.getByRole('button', { name: /Practice.*1 files/ }).click();
  const preview = panel.getByRole('region', { name: 'Saved snapshot preview' });
  const dismiss = page.waitForEvent('dialog').then(dialog => dialog.dismiss());
  await preview.getByRole('button', { name: 'Open saved snapshot' }).click();
  await dismiss;
  await expect(page.locator('.monaco-editor .view-lines')).toContainText('separate autosave');
  const accept = page.waitForEvent('dialog').then(dialog => dialog.accept());
  await preview.getByRole('button', { name: 'Open saved snapshot' }).click();
  await accept;
  await expect(page.locator('.monaco-editor .view-lines')).toContainText('library source');
  await expect(stdin).toHaveValue('');
  await preview.getByLabel('Rename snapshot').fill('Renamed');
  await preview.getByRole('button', { name: 'Rename saved snapshot' }).click();
  await expect(preview.getByRole('heading', { name: 'Renamed' })).toBeVisible();
  const remove = page.waitForEvent('dialog').then(dialog => dialog.accept());
  await preview.getByRole('button', { name: 'Delete snapshot' }).click();
  await remove;
  await expect(panel).toContainText('0 / 6 snapshots');
  await page.reload();
  await expect(page.locator('.monaco-editor .view-lines')).toContainText('separate autosave');
});

test('rejects a stale multi-tab update instead of losing the newer snapshot', async ({ page, context }) => {
  await page.goto('./');
  const other = await context.newPage();
  await other.goto('./');
  for (const tab of [page, other]) {
    await tab.getByRole('button', { name: 'Project library', exact: true }).click();
    await expect(tab.getByLabel('New snapshot name')).toBeVisible();
  }
  const first = page.getByRole('region', { name: 'Local project library' });
  const second = other.getByRole('region', { name: 'Local project library' });
  await first.getByLabel('New snapshot name').fill('First');
  await first.getByRole('button', { name: 'Save named snapshot' }).click();
  await expect(first).toContainText('Saved source snapshot "First".');
  await second.getByLabel('New snapshot name').fill('Second');
  await second.getByRole('button', { name: 'Save named snapshot' }).click();
  await expect(second).toContainText('Saved projects changed in another tab');
  await second.getByRole('button', { name: 'Refresh library' }).click();
  await expect(second).toContainText('1 / 6 snapshots');
  await second.getByRole('button', { name: 'Save named snapshot' }).click();
  await expect(second).toContainText('2 / 6 snapshots');
  await first.getByRole('button', { name: 'Refresh library' }).click();
  await expect(first).toContainText('2 / 6 snapshots');
  await other.close();
});

test('fits a narrow viewport and only clears the named library after confirmation', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('./');
  await page.getByRole('button', { name: 'Project library', exact: true }).click();
  const panel = page.getByRole('region', { name: 'Local project library' });
  await panel.getByLabel('New snapshot name').fill('Small screen');
  await panel.getByRole('button', { name: 'Save named snapshot' }).click();
  await expect(panel).toContainText('1 / 6 snapshots');
  expect(await page.locator('body').evaluate(element => element.scrollWidth)).toBeLessThanOrEqual(375);
  const cancel = page.waitForEvent('dialog').then(dialog => dialog.dismiss());
  await panel.getByRole('button', { name: 'Delete all named snapshots' }).click();
  await cancel;
  await expect(panel).toContainText('1 / 6 snapshots');
  const accept = page.waitForEvent('dialog').then(dialog => dialog.accept());
  await panel.getByRole('button', { name: 'Delete all named snapshots' }).click();
  await accept;
  await expect(panel).toContainText('0 / 6 snapshots');
});
