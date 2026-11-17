import { expect, test } from '@playwright/test';

// Real worker/WASM execution in Chromium, Firefox and WebKit. The output is
// copied from the immutable compiler release's published .stdout fixtures.
const published: Array<{ title: string; stdout: string }> = [
  {
    "title": "Ordered map snapshots",
    "stdout": "[list: 1, 2, 3]\n[list: \"one\", \"two\", \"three\"]\n[list: 2, 3]\n[list: \"TWO\", \"three\"]\n3 2\n"
  },
  {
    "title": "Boolean map snapshots",
    "stdout": "[list: false, true]\n[list: \"disabled\", \"enabled\"]\n[list: \"off\", \"enabled\"]\n2 2\n"
  },
  {
    "title": "Persistent task list snapshots",
    "stdout": "Counts 0 1 2\nFirst Draft Review\nSnapshots Review Approved\nRemaining 1 Approved\nActive Approved\n"
  },
  {
    "title": "Immutable compiler fixture",
    "stdout": "1\n7\na\n"
  }
];

for (const fixture of published) {
  test('alpha.13 verifies and executes published source: ' + fixture.title, async ({ page }) => {
    await page.goto('./');
    await page.getByRole('button', { name: new RegExp(fixture.title, 'i') }).click();
    await page.getByRole('button', { name: 'Verify code' }).click();
    await expect(page.locator('.terminal-output')).toContainText(
      'Static verification passed', { timeout: 30_000 },
    );
    await page.getByRole('button', { name: 'Run code' }).click();
    await expect(page.locator('.stdout')).toHaveText(fixture.stdout, { timeout: 30_000 });
    await expect(page.locator('.error-panel')).toHaveCount(0);
  });
}

test('alpha.13 preserves atomic failures and recovers with another disposable worker', async ({ page }) => {
  await page.goto('./#code=' + encodeURIComponent(
    'print("uncommitted"); bind bad = [map: 1: "one", 1: "two"]; print(bad);',
  ));
  await page.getByRole('button', { name: 'Run code' }).click();
  await expect(page.locator('.error-title')).toContainText('E0082', { timeout: 30_000 });
  await expect(page.locator('.stdout')).toHaveCount(0);
  await page.goto('./');
  await page.getByRole('button', { name: 'Ordered map snapshots' }).click();
  await page.getByRole('button', { name: 'Run code' }).click();
  await expect(page.locator('.stdout')).toHaveText("[list: 1, 2, 3]\n[list: \"one\", \"two\", \"three\"]\n[list: 2, 3]\n[list: \"TWO\", \"three\"]\n3 2\n", { timeout: 30_000 });
});
