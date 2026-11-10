import { expect, test } from '@playwright/test';

test('project search navigates to a real module and leaves compiler execution usable', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: /Import a module/ }).click();
  await page.getByRole('button', { name: 'Find in project' }).click();
  const search = page.getByRole('searchbox', { name: 'Search text in project' });
  await expect(search).toBeFocused();
  await search.fill('twice');
  await expect(page.locator('.project-search-status')).toContainText('2 matching locations');
  await page.getByRole('button', { name: /^Open math.srp line 1 column / }).click();
  await expect(page.getByRole('tab', { name: /math.srp/ })).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('.monaco-editor textarea.inputarea')).toBeFocused();
  await page.getByRole('button', { name: 'Run code' }).click();
  await expect(page.locator('.stdout')).toHaveText('42\n', { timeout: 30_000 });
});

test('keyboard shortcut opens literal project search and the panel can close', async ({ page }) => {
  await page.goto('./#code=' + encodeURIComponent('print("a.b");\nprint("a-b");'));
  await page.keyboard.press('Control+Shift+f');
  const search = page.getByRole('searchbox', { name: 'Search text in project' });
  await expect(search).toBeFocused();
  await search.fill('a.b');
  await expect(page.locator('.project-search-status')).toContainText('1 matching locations');
  await expect(page.getByRole('button', { name: /Open main.srp line 1 column/ })).toBeVisible();
  await page.getByRole('button', { name: 'Close project search' }).click();
  await expect(search).toHaveCount(0);
});
