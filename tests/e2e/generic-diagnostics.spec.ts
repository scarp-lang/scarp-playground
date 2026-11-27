import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';

const cases = [
  {
    source: 'funcra f<T,T>(a:T)->T{return a;}',
    code: 'E0085',
    guidance: 'Declare each generic type parameter once',
  },
  {
    source: 'funcra f<T>(a:T,b:T)->T{return a;} f(1,2.0);',
    code: 'E0086',
    guidance: 'identity::<integer>(7)',
  },
] as const;

for (const { source, code, guidance } of cases) {
  test('generic diagnostic preserves original compiler hint: ' + code, async ({ page }) => {
    await page.goto('./#code=' + encodeURIComponent(source));
    await page.getByRole('button', { name: 'Verify code' }).click();
    await expect(page.locator('.error-title')).toContainText(code, { timeout: 30_000 });
    await expect(page.locator('.browser-diagnostic-help')).toContainText(guidance);
    await expect(page.locator('.stdout')).toHaveCount(0);
    const hint = page.locator('.compiler-diagnostic-help');
    await expect(hint.locator('summary')).toBeVisible();
    await hint.locator('summary').click();
    await expect(hint.locator('.error-help')).toBeVisible();

    const pending = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download result' }).click();
    const result = await pending;
    const report = await readFile(await result.path(), 'utf8');
    expect(report).toContain('Verification failed');
    expect(report).toContain(code);
    expect(report).toContain('Playground guidance:');
    expect(report).toContain(guidance);
    expect(report).toContain('Original compiler hint:');
  });
}
