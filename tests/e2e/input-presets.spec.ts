import { expect, test } from '@playwright/test';

test('saved input presets load exact buffered stdin but do not execute the program', async ({ page }) => {
  await page.goto('./');
  const input = page.getByRole('textbox', { name: 'Program input (stdin)' });
  await input.fill('नमस्ते\n42\n');
  await page.getByRole('button', { name: 'Input presets' }).click();
  const panel = page.getByRole('region', { name: 'Buffered input presets' });
  await expect(panel).toBeVisible();
  await panel.getByLabel('Name for current program input').fill('Hindi sample');
  await panel.getByRole('button', { name: 'Capture current input' }).click();
  await expect(panel.getByLabel('Input preset library usage')).toContainText('1/12 presets');
  await expect(panel).toContainText('Hindi sample');
  await panel.getByRole('button', { name: 'Close input presets' }).click();
  await input.fill('temporary input');
  await page.getByRole('button', { name: 'Input presets' }).click();
  page.once('dialog', dialog => void dialog.accept());
  await panel.getByRole('button', { name: 'Load into Run input' }).click();
  await expect(input).toHaveValue('नमस्ते\n42\n');
  await expect(panel).not.toBeVisible();
});

test('saved stdin content remains hidden outside explicit Edit mode', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('textbox', { name: 'Program input (stdin)' }).fill('PRIVATE_LOCAL_INPUT');
  await page.getByRole('button', { name: 'Input presets' }).click();
  const panel = page.getByRole('region', { name: 'Buffered input presets' });
  await panel.getByRole('button', { name: 'Capture current input' }).click();
  await expect(panel.getByText('PRIVATE_LOCAL_INPUT')).toHaveCount(0);
  await panel.getByRole('button', { name: 'Edit selected' }).click();
  await expect(panel.getByLabel('Buffered stdin content')).toHaveValue('PRIVATE_LOCAL_INPUT');
  await panel.getByLabel('Preset name').fill('Updated sample');
  await panel.getByLabel('Buffered stdin content').fill('new content\n');
  await panel.getByRole('button', { name: 'Save preset edits' }).click();
  await expect(panel.getByRole('combobox', { name: 'Choose saved input preset' })).toContainText('Updated sample');
  await expect(panel.getByLabel('Buffered stdin content')).toHaveCount(0);
});

test('input presets do not persist in URLs or localStorage after a reload', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('textbox', { name: 'Program input (stdin)' }).fill('PRIVATE_PRESET_VALUE');
  await page.getByRole('button', { name: 'Input presets' }).click();
  const panel = page.getByRole('region', { name: 'Buffered input presets' });
  await panel.getByRole('button', { name: 'Capture current input' }).click();
  const saved = await page.evaluate(() => ({
    local: Object.entries(window.localStorage),
    hash: window.location.hash,
  }));
  expect(JSON.stringify(saved)).not.toContain('PRIVATE_PRESET_VALUE');
  await page.reload();
  await page.getByRole('button', { name: 'Input presets' }).click();
  await expect(panel.getByText(/No input presets captured yet/)).toBeVisible();
});

test('invalid oversized input preset edit is rejected without overwriting the old preset', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('textbox', { name: 'Program input (stdin)' }).fill('small');
  await page.getByRole('button', { name: 'Input presets' }).click();
  const panel = page.getByRole('region', { name: 'Buffered input presets' });
  await panel.getByRole('button', { name: 'Capture current input' }).click();
  await panel.getByRole('button', { name: 'Edit selected' }).click();
  await panel.getByLabel('Buffered stdin content').fill('X'.repeat(16 * 1024 + 1));
  await panel.getByRole('button', { name: 'Save preset edits' }).click();
  await expect(panel).toContainText('exceeds the 16 KiB browser limit');
  await panel.getByRole('button', { name: 'Cancel' }).click();
  await expect(panel.getByText(/5 UTF-8 bytes/)).toBeVisible();
});

test('input presets are available from the keyboard command palette', async ({ page }) => {
  await page.goto('./');
  await page.keyboard.press('Control+Shift+P');
  const palette = page.getByRole('dialog', { name: 'Command palette' });
  await palette.getByRole('combobox', { name: 'Search commands' }).fill('Buffered input presets');
  await palette.getByRole('option', { name: /Buffered input presets/ }).click();
  await expect(page.getByRole('region', { name: 'Buffered input presets' })).toBeVisible();
});
