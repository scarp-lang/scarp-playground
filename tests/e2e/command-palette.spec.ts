import { expect, test } from '@playwright/test';

test('opens by keyboard, finds a real compiler action and restores focus on dismissal', async ({ page }) => {
  await page.goto('./');
  const launcher = page.getByRole('button', { name: 'Commands', exact: true });
  await launcher.focus();
  await page.keyboard.press('ControlOrMeta+Shift+P');
  const dialog = page.getByRole('dialog', { name: 'Command palette' });
  const search = dialog.getByRole('combobox', { name: 'Search commands' });
  await expect(search).toBeFocused();
  await search.fill('verify code');
  await expect(dialog.getByRole('option', { name: /Verify code/ })).toHaveAttribute('aria-selected', 'true');
  await search.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(launcher).toBeFocused();
  await launcher.click();
  await search.fill('verify code');
  await search.press('Enter');
  await expect(dialog).toHaveCount(0);
  await expect(page.locator('.terminal-output')).toContainText('Static verification passed', { timeout: 30_000 });
  await expect(page.locator('.stdout')).toHaveCount(0);
});

test('disabled command cannot run, and browsing never changes source', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: 'Commands', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Command palette' });
  const search = dialog.getByRole('combobox', { name: 'Search commands' });
  await search.fill('stop execution');
  await expect(dialog.getByRole('option', { name: /Stop execution/ })).toHaveAttribute('aria-disabled', 'true');
  await search.press('Enter');
  await expect(dialog).toBeVisible();
  await search.fill('word wrap');
  await search.press('Enter');
  await expect(page.getByRole('button', { name: 'Disable word wrap' })).toBeVisible();
  await expect(page.locator('.monaco-editor .view-lines')).toContainText('Hello from Scarp!');
});

test('command search fits mobile and hands off to the file navigation dialog', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('./');
  await page.getByRole('button', { name: 'Commands', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Command palette' });
  const search = dialog.getByRole('combobox', { name: 'Search commands' });
  await search.fill('no command matches');
  await expect(dialog).toContainText('No matching actions.');
  expect(await page.locator('body').evaluate(element => element.scrollWidth)).toBeLessThanOrEqual(375);
  await search.fill('quick open');
  await search.press('Enter');
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('dialog', { name: 'Quick open Scarp file' })).toBeVisible();
});
