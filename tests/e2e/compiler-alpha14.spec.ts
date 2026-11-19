import { expect, test } from '@playwright/test';

// Exact output from the annotated upstream alpha.14 .stdout fixtures.
// Playwright executes the real compiled Rust interpreter in three browsers.
const published = [
  {
    "title": "Nested pattern matching",
    "stdout": "12\n30\n13\n"
  },
  {
    "title": "Ordered string-map projections",
    "stdout": "[list: \"a\", \"m\", \"z\"]\n[list: 1, 5, 9]\n[list: \"a\", \"b\", \"m\", \"z\"]\n[list: 1, 2, 5, 9]\n[list: \"a\", \"b\", \"m\", \"z\"]\n[list: 1, 2, 50, 9]\n[list: \"a\", \"b\", \"m\"]\n[list: 1, 2, 50]\n[list: \"a\", \"m\", \"z\"]\n[list: 1, 5, 9]\n"
  }
];

for (const fixture of published) {
  test('alpha.14 verifies and executes official fixture: ' + fixture.title, async ({ page }) => {
    await page.goto('./');
    await page.getByRole('button', { name: fixture.title }).click();
    await page.getByRole('button', { name: 'Verify code' }).click();
    await expect(page.locator('.terminal-output')).toContainText(
      'Static verification passed', { timeout: 30_000 },
    );
    await page.getByRole('button', { name: 'Run code' }).click();
    await expect(page.locator('.stdout')).toHaveText(fixture.stdout, { timeout: 30_000 });
    await expect(page.locator('.error-panel')).toHaveCount(0);
  });
}

test('alpha.14 identifies a missing destructuring comma without partial stdout', async ({ page }) => {
  await page.goto('./#code=' + encodeURIComponent(
    'print("uncommitted"); bind (first second) = (1, 2);',
  ));
  await page.getByRole('button', { name: 'Run code' }).click();
  await expect(page.locator('.error-panel')).toContainText(
    "expected ',' between destructuring pattern members", { timeout: 30_000 },
  );
  await expect(page.locator('.stdout')).toHaveCount(0);
  await page.goto('./');
  await page.getByRole('button', { name: 'Nested pattern matching' }).click();
  await page.getByRole('button', { name: 'Run code' }).click();
  await expect(page.locator('.stdout')).toHaveText('12\n30\n13\n', { timeout: 30_000 });
});
