import { loadExample } from './support/example-switch';
import { expect, test } from '@playwright/test';

test('Monaco suggests actual local .srp paths inside import strings', async ({ page }) => {
  await page.goto('./');
  await loadExample(page, /Import a module/);
  const input = page.locator('.monaco-editor textarea.inputarea');
  await expect(input).toBeAttached();
  await input.focus();
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.insertText('import "ma');
  await page.keyboard.press('Control+Space');
  await expect(page.locator('.suggest-widget.visible')).toContainText('math.srp');
});
