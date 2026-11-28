import { expect, type Page } from '@playwright/test';

/** Select by the exact published title (or one unambiguous pattern), then
 * explicitly load. Native options do not create a page-height list. */
export async function chooseExample(page: Page, name: string | RegExp): Promise<void> {
  const select = page.getByRole('combobox', { name: 'Choose an example' });
  await expect(select).toBeVisible();
  const option = select.getByRole('option', { name, exact: typeof name === 'string' });
  await expect(option).toHaveCount(1);
  const value = await option.getAttribute('value');
  if (!value) throw new Error('Missing example option value');
  await select.selectOption(value);
}

export async function loadExample(page: Page, name: string | RegExp): Promise<void> {
  await chooseExample(page, name);
  await page.getByRole('button', { name: 'Load example', exact: true }).click();
}

/** Explicitly accept replacement when a regression test discards edited code. */
export async function replaceExampleAfterEdit(page: Page, name: string | RegExp): Promise<void> {
  await chooseExample(page, name);
  const confirmation = page.waitForEvent('dialog').then(async dialog => {
    expect(dialog.type()).toBe('confirm');
    expect(dialog.message()).toContain('Current source edits and program input will be lost');
    await dialog.accept();
  });
  await page.getByRole('button', { name: 'Load example', exact: true }).click();
  await confirmation;
}
