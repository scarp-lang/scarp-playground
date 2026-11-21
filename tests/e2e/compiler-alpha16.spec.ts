import { expect, test } from '@playwright/test';

// The real pinned Rust/WASM interpreter runs the upstream fixtures in all browsers.
const published = [
  {
    "title": "Median and quantiles",
    "stdout": "3.0\n1.75\n4.75\n2.0\n[4.0, 1.0, 7.0, 2.0]\n"
  },
  {
    "title": "Unicode and integer utilities",
    "stdout": "STRASSE i̇ Aनवमन🌍\n4 2\n42 -1 6 210\n64 63 -9223372036854775808\n"
  }
];

for (const fixture of published) {
  test('alpha.16 verifies, checks, and runs official fixture: ' + fixture.title, async ({ page }) => {
    await page.goto('./');
    await page.getByRole('button', { name: fixture.title }).click();
    await page.getByRole('button', { name: 'Verify code' }).click();
    await expect(page.locator('.terminal-output')).toContainText(
      'Static verification passed', { timeout: 30_000 },
    );
    await expect(page.locator('.stdout')).toHaveCount(0);
    await page.getByRole('button', { name: 'Check code' }).click();
    await expect(page.locator('.terminal-output')).toContainText(
      'Checks passed.', { timeout: 30_000 },
    );
    await expect(page.locator('.stdout')).toHaveCount(0);
    await page.getByRole('button', { name: 'Run code' }).click();
    await expect(page.locator('.stdout')).toHaveText(fixture.stdout, { timeout: 30_000 });
    await expect(page.locator('.error-panel')).toHaveCount(0);
  });
}

test('alpha.16 rejects invalid quantiles atomically and recovers in a fresh worker', async ({ page }) => {
  await page.goto('./#code=' + encodeURIComponent(
    'print("uncommitted"); eprint("private"); print(quantile([1.0, 2.0], 1.5));',
  ));
  await page.getByRole('button', { name: 'Run code' }).click();
  await expect(page.locator('.error-title')).toContainText('E0034', { timeout: 30_000 });
  await expect(page.locator('.stdout')).toHaveCount(0);
  await expect(page.locator('.stderr')).toHaveCount(0);
  await page.goto('./#code=' + encodeURIComponent('print(median([2.0, 4.0]));'));
  await page.getByRole('button', { name: 'Run code' }).click();
  await expect(page.locator('.stdout')).toHaveText('3.0\n', { timeout: 30_000 });
  await expect(page.locator('.error-panel')).toHaveCount(0);
});
