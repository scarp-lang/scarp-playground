import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

async function delayProjectRead(page: Page) {
  await page.addInitScript(() => {
    const original = File.prototype.text;
    const state = window as Window & { releaseProjectRead?: () => void };
    File.prototype.text = async function () {
      if (this.name === 'temporary-project.json') {
        await new Promise<void>(resolve => { state.releaseProjectRead = resolve; });
      }
      return original.call(this);
    };
  });
  await page.goto('./');
}

async function releaseRead(page: Page) {
  await page.evaluate(() => {
    const state = window as Window & { releaseProjectRead?: () => void };
    state.releaseProjectRead?.();
    delete state.releaseProjectRead;
  });
}

async function beginRead(page: Page) {
  await page.locator('input[aria-label="Import project JSON"]')
    .setInputFiles('tests/fixtures/temporary-project.json');
  await expect(page.getByRole('button', { name: 'Import project', exact: true })).toBeDisabled();
  await page.waitForFunction(() => typeof (window as Window & {
    releaseProjectRead?: () => void;
  }).releaseProjectRead === 'function');
}

test('pending JSON import cannot replace edited source or overwrite its saved browser copy', async ({ page }) => {
  await delayProjectRead(page);
  await page.getByRole('button', { name: 'Save locally' }).click();
  await beginRead(page);
  const editor = page.locator('.monaco-editor textarea.inputarea');
  await editor.focus();
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.insertText('print("newer source");');
  // A stale read must be rejected before asking for destructive confirmation.
  let dialogs = 0;
  page.on('dialog', async dialog => { dialogs++; await dialog.dismiss(); });
  await releaseRead(page);
  await expect(page.locator('.notice')).toContainText('editor session changed during project reading');
  await expect(page.getByRole('button', { name: 'Import project', exact: true })).toBeEnabled();
  expect(dialogs).toBe(0);
  await page.getByRole('button', { name: 'Run code' }).click();
  await expect(page.locator('.stdout')).toHaveText('newer source\n', { timeout: 30_000 });
  await page.reload();
  await page.getByRole('button', { name: 'Run code' }).click();
  await expect(page.locator('.stdout')).toHaveText('newer source\n', { timeout: 30_000 });
});

test('pending JSON import rejects changed stdin and can be retried explicitly', async ({ page }) => {
  await delayProjectRead(page);
  await beginRead(page);
  await page.getByRole('textbox', { name: /program input/i }).fill('new input');
  await releaseRead(page);
  await expect(page.locator('.notice')).toContainText('editor session changed during project reading');
  await expect(page.getByRole('textbox', { name: /program input/i })).toHaveValue('new input');
  await beginRead(page);
  const accepted = page.waitForEvent('dialog').then(dialog => dialog.accept());
  await releaseRead(page);
  await accepted;
  await expect(page.locator('.notice')).toContainText('Imported');
  await expect(page.getByRole('textbox', { name: /program input/i })).toHaveValue('');
});

test('pending JSON import rejects a persistence-mode change', async ({ page }) => {
  await delayProjectRead(page);
  await beginRead(page);
  await page.getByRole('button', { name: 'Save locally' }).click();
  await releaseRead(page);
  await expect(page.locator('.notice')).toContainText('editor session changed during project reading');
  await expect(page.getByRole('button', { name: 'Forget saved copy' })).toBeVisible();
});
