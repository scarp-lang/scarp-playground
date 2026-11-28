import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';

test('previews a local folder, selects entry, imports nested sources and preserves the saved copy', async ({ page }) => {
  const root = await mkdtemp(join(tmpdir(), 'scarp-folder-'));
  try {
    await mkdir(join(root, 'lib'));
    await mkdir(join(root, 'src'));
    await writeFile(join(root, 'main.srp'), 'print("other entry");');
    await writeFile(join(root, 'src', 'main.srp'), 'import "../lib/math.srp" as math;\nprint(math.twice(21));\n');
    await writeFile(join(root, 'lib', 'math.srp'), 'pub pure funcra twice(n: integer) -> integer { return n * 2; }\n');
    await writeFile(join(root, 'README.md'), 'ignored');
    await page.goto('./');
    await page.getByRole('button', { name: 'Save locally' }).click();
    await page.getByRole('textbox', { name: /program input/i }).fill('old input');
    const picker = page.getByLabel('Choose Scarp source folder');
    await expect(picker).toHaveAttribute('webkitdirectory', '');
    await picker.setInputFiles(root);
    const preview = page.getByRole('region', { name: 'Source folder preview' });
    await expect(preview).toContainText('3 .srp files');
    await expect(preview).toContainText('1 non-source files ignored');
    await expect(preview).toContainText('lib/math.srp');
    await expect(preview.getByLabel('Entrypoint')).toHaveValue('main.srp');
    await preview.getByLabel('Entrypoint').selectOption('src/main.srp');
    await expect(page.getByRole('tab', { name: /src\/main.srp/ })).toHaveCount(0);
    const dismissed = page.waitForEvent('dialog').then(dialog => dialog.dismiss());
    await preview.getByRole('button', { name: 'Replace with source folder' }).click();
    await dismissed;
    await expect(preview).toBeVisible();
    await expect(page.getByRole('textbox', { name: /program input/i })).toHaveValue('old input');
    const accepted = page.waitForEvent('dialog').then(dialog => dialog.accept());
    await preview.getByRole('button', { name: 'Replace with source folder' }).click();
    await accepted;
    await expect(preview).toHaveCount(0);
    await expect(page.getByRole('tab', { name: /src\/main.srp/ })).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('textbox', { name: /program input/i })).toHaveValue('');
    await page.getByRole('button', { name: 'Run code' }).click();
    await expect(page.locator('.stdout')).toHaveText('42\n', { timeout: 30_000 });
    await page.reload();
    await expect(page.getByRole('tab', { name: /src\/main.srp/ })).toHaveCount(0);
    await page.getByRole('button', { name: 'Run code' }).click();
    await expect(page.locator('.stdout')).toHaveText('Hello from Scarp!\n', { timeout: 30_000 });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('rejects invalid UTF-8 and invalidates a folder preview when source changes', async ({ page }) => {
  const root = await mkdtemp(join(tmpdir(), 'scarp-folder-'));
  try {
    await writeFile(join(root, 'main.srp'), Uint8Array.of(0xc3, 0x28));
    await page.goto('./');
    const picker = page.getByLabel('Choose Scarp source folder');
    await expect(picker).toHaveAttribute('webkitdirectory', '');
    await picker.setInputFiles(root);
    await expect(page.locator('.notice')).toContainText('not valid UTF-8');
    await expect(page.getByRole('region', { name: 'Source folder preview' })).toHaveCount(0);
    await writeFile(join(root, 'main.srp'), 'print(42);');
    await picker.setInputFiles(root);
    const preview = page.getByRole('region', { name: 'Source folder preview' });
    await expect(preview).toBeVisible();
    const editor = page.locator('.monaco-editor textarea.inputarea');
    await editor.focus();
    await page.keyboard.press('ControlOrMeta+End');
    await page.keyboard.insertText(' ');
    await expect(preview).toHaveCount(0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
