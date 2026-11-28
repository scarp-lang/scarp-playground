import { loadExample } from './support/example-switch';
import { expect, test } from '@playwright/test';

test('shows actual local dependencies, navigates to modules and refreshes on edits', async ({ page }) => {
  await page.goto('./');
  await loadExample(page, /Import a module/);
  await page.getByRole('button', { name: 'Module dependencies', exact: true }).click();
  const panel = page.getByRole('region', { name: 'Module dependencies' });
  await expect(panel).toContainText('2 files');
  await expect(panel).toContainText('1 scanned imports');
  await expect(panel).toContainText('2 reached from entry');
  await panel.getByRole('button', { name: 'Open imported module math.srp' }).click();
  await expect(page.getByRole('tab', { name: /math.srp/ })).toHaveAttribute('aria-selected', 'true');
  await panel.getByRole('button', { name: 'Go to import in main.srp:1:9' }).click();
  await expect(page.getByRole('tab', { name: /main.srp/ })).toHaveAttribute('aria-selected', 'true');

  const editor = page.locator('.monaco-editor textarea.inputarea');
  await editor.focus();
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.insertText('import "absent.srp" as absent;');
  await expect(panel).toContainText('Missing: absent.srp');
  await expect(panel).toContainText('1 unresolved');
  await expect(panel.getByRole('article', { name: 'Dependencies for math.srp' })).toContainText('Not reached by scanned imports');
  await page.getByRole('button', { name: 'Close module dependencies' }).click();
  await expect(panel).toHaveCount(0);
});

test('reports partial graph and supports narrow layouts without modifying source', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('./#code=' + encodeURIComponent('bind note = """unfinished'));
  await page.getByRole('button', { name: 'Module dependencies', exact: true }).click();
  const panel = page.getByRole('region', { name: 'Module dependencies' });
  await expect(panel).toContainText('Partial scan');
  await expect(panel).toContainText('Cannot inspect import syntax in main.srp.');
  await expect(page.locator('.monaco-editor .view-lines')).toContainText('unfinished');
  expect(await page.locator('body').evaluate(element => element.scrollWidth)).toBeLessThanOrEqual(375);
});
