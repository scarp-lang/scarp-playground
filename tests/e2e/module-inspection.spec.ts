import { expect, test } from '@playwright/test';

test('shows real resolved signatures, imports and uncompiled paths without evaluating runtime input', async ({ page }) => {
  const workspace = { entry: 'main.srp', files: {
    'main.srp': 'import "lib/math.srp" as math;\nprint(1 / 0);\nprint(read_line());',
    'lib/math.srp': '// नमस्ते 😀\npub pure funcra twice(value: integer) -> integer { return value * 2; }\npub bind answer: integer = 42;',
    'scratch.srp': 'not valid Scarp',
  } };
  const payload = { format: 'scarp-playground-workspace', version: 1, workspace, activeFile: 'main.srp' };
  await page.goto('./#project=' + encodeURIComponent(JSON.stringify(payload)));
  await page.getByRole('textbox', { name: /program input/i }).fill('not consumed');
  await page.getByRole('button', { name: 'Compiler inspection', exact: true }).click();
  const panel = page.getByRole('region', { name: 'Compiler module inspection' });
  await panel.getByRole('button', { name: 'Inspect modules' }).click();
  await expect(panel).toContainText('2 resolved modules', { timeout: 30_000 });
  await expect(panel.getByRole('region', { name: 'Uncompiled workspace files' })).toContainText('scratch.srp');
  await panel.getByRole('button', { name: 'Inspect target math' }).click();
  await expect(panel).toContainText('pub pure funcra twice(value: integer) -> integer');
  await expect(panel).toContainText('pub bind answer: integer');
  await panel.getByLabel('Symbol kind').selectOption('function');
  await expect(panel).toContainText('1 of 2 module declarations');
  await panel.getByRole('button', { name: 'Navigate to twice' }).click();
  await expect(page.getByRole('tab', { name: /lib\/math.srp/ })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('textbox', { name: /program input/i })).toHaveValue('not consumed');
  await expect(page.locator('.stdout')).toHaveCount(0);
  const editor = page.locator('.monaco-editor textarea.inputarea');
  await editor.focus();
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.insertText('pub bind replacement = 3;');
  await expect(panel).toContainText('Inspect the current workspace to see resolved metadata.');
});

test('reports unresolved module diagnostics and does not fabricate a graph', async ({ page }) => {
  await page.goto('./#code=' + encodeURIComponent('import "absent.srp" as missing;'));
  await page.getByRole('button', { name: 'Compiler inspection', exact: true }).click();
  const panel = page.getByRole('region', { name: 'Compiler module inspection' });
  await panel.getByRole('button', { name: 'Inspect modules' }).click();
  await expect(panel).toContainText('E0038', { timeout: 30_000 });
  await expect(panel.getByRole('region', { name: 'Resolved imports' })).toHaveCount(0);
});
