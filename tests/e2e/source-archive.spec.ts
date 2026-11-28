import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { readStoredZip } from '../support/read-stored-zip';

test('downloads every source with nested paths and excludes ephemeral input', async ({ page }) => {
  const workspace = { entry: 'main.srp', files: {
    'main.srp': 'import "lib/math.srp" as math;\nprint(math.twice(21));\n',
    'lib/math.srp': '// नमस्ते 😀\r\npub pure funcra twice(n: integer) -> integer { return n * 2; }\n',
    'scratch.srp': '',
  } };
  const payload = { format: 'scarp-playground-workspace', version: 1, workspace, activeFile: 'lib/math.srp' };
  await page.goto('./#project=' + encodeURIComponent(JSON.stringify(payload)));
  await page.getByRole('textbox', { name: /program input/i }).fill('PRIVATE_INPUT_NOT_IN_ARCHIVE');
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download sources ZIP' }).click();
  const download = await pending;
  expect(download.suggestedFilename()).toBe('scarp-sources.zip');
  const files = readStoredZip(await readFile(await download.path()));
  expect([...files.keys()]).toEqual(Object.keys(workspace.files).sort());
  for (const [path, bytes] of files) {
    expect(new TextDecoder().decode(bytes)).toBe(workspace.files[path as keyof typeof workspace.files]);
  }
  await expect(page.getByRole('tab', { name: /lib\/math.srp/ })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('textbox', { name: /program input/i })).toHaveValue('PRIVATE_INPUT_NOT_IN_ARCHIVE');
  await expect(page.locator('.notice')).toContainText('No source or program input was uploaded');
  await page.getByRole('button', { name: 'Run code' }).click();
  await expect(page.locator('.stdout')).toHaveText('42\n', { timeout: 30_000 });
});

test('source archive remains accessible at narrow viewport widths', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('./');
  // Wait for the deferred sidebar and editor to settle before scrolling.
  await expect(page.getByRole('searchbox', { name: 'Find an example' })).toBeVisible();
  await expect(page.locator('.monaco-editor textarea.inputarea')).toBeAttached();
  const button = page.getByRole('button', { name: 'Download sources ZIP' });
  await button.scrollIntoViewIfNeeded();
  await expect(button).toBeInViewport();
  expect(await page.locator('body').evaluate(element => element.scrollWidth)).toBeLessThanOrEqual(375);
  const pending = page.waitForEvent('download');
  await button.click();
  expect((await pending).suggestedFilename()).toBe('scarp-sources.zip');
});


test('reports nonportable path collisions without changing the workspace', async ({ page }) => {
  const payload = {
    format: 'scarp-playground-workspace', version: 1,
    workspace: { entry: 'main.srp', files: { 'main.srp': '', 'Lib/a.srp': '', 'lib/b.srp': '' } },
    activeFile: 'main.srp',
  };
  await page.goto('./#project=' + encodeURIComponent(JSON.stringify(payload)));
  await page.getByRole('button', { name: 'Download sources ZIP' }).click();
  await expect(page.locator('.notice')).toContainText('differ only by letter case');
  await expect(page.getByRole('tab', { name: /Lib\/a.srp/ })).toBeVisible();
  await expect(page.getByRole('tab', { name: /lib\/b.srp/ })).toBeVisible();
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export project', exact: true }).click();
  const download = await pending;
  const result = JSON.parse(await readFile(await download.path(), 'utf8'));
  expect(result.workspace.files).toEqual(payload.workspace.files);
});
