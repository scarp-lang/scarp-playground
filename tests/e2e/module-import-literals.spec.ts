import { loadExample } from './support/example-switch';
import { expect, test } from '@playwright/test';

for (const quote of ['raw', 'multiline'] as const) {
  test('rename actual ' + quote + ' import while preserving verbatim text', async ({ page }) => {
    await page.goto('./');
    await loadExample(page, /Import a module/);
    const delimiter = quote === 'raw' ? ['r"', '"'] : ['"""', '"""'];
    const source = [
      'import ' + delimiter[0] + 'math.srp' + delimiter[1] + ' as math;',
      'bind note = """',
      'import "math.srp" as pretend;',
      '""";',
      'print(math.twice(21));',
    ].join('\n');
    const editor = page.locator('.monaco-editor textarea.inputarea');
    await editor.focus();
    await page.keyboard.press('ControlOrMeta+A');
    await page.keyboard.insertText(source);
    await page.getByRole('button', { name: 'Run code' }).click();
    await expect(page.locator('.stdout')).toHaveText('42\n', { timeout: 30_000 });
    await page.getByRole('tab', { name: /math.srp/ }).click();
    await page.getByRole('button', { name: 'Rename file' }).click();
    await page.getByLabel('New relative .srp path').fill('lib/math.srp');
    await page.getByRole('button', { name: 'Preview file rename' }).click();
    const preview = page.getByTestId('file-move-preview');
    await expect(preview).toContainText('rewrite 1 import path(s)');
    await expect(preview).toContainText(delimiter[0] + 'lib/math.srp' + delimiter[1]);
    await page.getByRole('button', { name: 'Apply file rename' }).click();
    await page.getByRole('tab', { name: /main.srp/ }).click();
    await expect(page.locator('.monaco-editor .view-lines')).toContainText('import "math.srp" as pretend;');
    await page.getByRole('button', { name: 'Run code' }).click();
    await expect(page.locator('.stdout')).toHaveText('42\n', { timeout: 30_000 });
  });
}
