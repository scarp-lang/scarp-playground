import { expect, test } from '@playwright/test';

test('parses declarations through real WASM, filters them and navigates to the exact source', async ({ page }) => {
  const source = '// नमस्ते 😀\nimport r"missing.srp" as missing;\n' +
    'pure funcra identity<T>(value: T) -> T { bind local = value; return local; }\n' +
    'bind (left, right) = (1, 2);\nprint(read_line());';
  await page.goto('./#code=' + encodeURIComponent(source));
  await page.getByRole('button', { name: 'Source outline', exact: true }).click();
  const panel = page.getByRole('region', { name: 'Source outline' });
  await panel.getByRole('button', { name: 'Refresh outline' }).click();
  await expect(panel).toContainText('7 of 7 declarations', { timeout: 30_000 });
  await expect(panel).toContainText('Pure function');
  await expect(panel).toContainText('Type parameter');
  await expect(panel).toContainText('Import alias');
  await panel.getByLabel('Filter symbol names').fill('local');
  await expect(panel).toContainText('1 of 7 declarations');
  await panel.getByRole('button', { name: 'Go to local on line 3' }).click();
  await expect(page.locator('.monaco-editor textarea.inputarea')).toBeFocused();
  await panel.getByLabel('Filter symbol names').fill('');
  await panel.getByLabel('Declaration kind').selectOption('parameter');
  await expect(panel).toContainText('1 of 7 declarations');
  await expect(panel).toContainText('value');
  await expect(page.locator('.stdout')).toHaveCount(0);
});

test('reports real parser errors and invalidates the outline on source edits', async ({ page }) => {
  await page.goto('./#code=' + encodeURIComponent('funcra f<T,T>(a:T)->T{return a;}'));
  await page.getByRole('button', { name: 'Source outline', exact: true }).click();
  const panel = page.getByRole('region', { name: 'Source outline' });
  await panel.getByRole('button', { name: 'Refresh outline' }).click();
  await expect(panel).toContainText('E0085', { timeout: 30_000 });
  const editor = page.locator('.monaco-editor textarea.inputarea');
  await editor.focus();
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.insertText('bind answer = 42;\nprint(answer);');
  await expect(panel).toContainText('Refresh the outline for the current source.');
  await panel.getByRole('button', { name: 'Refresh outline' }).click();
  await expect(panel).toContainText('1 of 1 declarations', { timeout: 30_000 });
  await expect(panel.getByRole('button', { name: 'Go to answer on line 1' })).toBeVisible();
  await page.getByRole('button', { name: 'Run code' }).click();
  await expect(page.locator('.stdout')).toHaveText('42\n', { timeout: 30_000 });
});
