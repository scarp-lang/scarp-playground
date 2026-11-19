import { expect, type Page } from '@playwright/test';

/**
 * Explicitly accept replacement when a regression test intentionally discards
 * edited or shared source to prove a fresh compiler Worker can recover.
 *
 * The Playground must keep warning real users about unsaved work; the test
 * opts in to that destructive transition rather than bypassing the guard.
 */
export async function replaceExampleAfterEdit(page: Page, name: string | RegExp): Promise<void> {
  const confirmation = page.waitForEvent('dialog').then(async dialog => {
    expect(dialog.type()).toBe('confirm');
    expect(dialog.message()).toContain('Current source edits and program input will be lost');
    await dialog.accept();
  });
  await page.getByRole('button', { name }).click();
  await confirmation;
}
