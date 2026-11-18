import { expect, test } from '@playwright/test';

const published: Array<{ title: string; stdout: string }> = [
  { title: 'Data destructuring', stdout: '42 ready\n8 7\n42\n5 inner\n42\n37 INR\n' },
  { title: 'Typed records and lists', stdout: 'First Draft\nUpdated Ready Publish\nEmpty [list: <integer>]\nNested 2 3\n' },
  {
    title: 'Typed immutable maps',
    stdout: '[map: "a": 1, "z": 9]\ntrue\n[map: <integer, string>]\n[map: false: "disabled", true: "enabled"]\n[map: 1: [list: 3], 2: [list: 1, 2]]\n',
  },
  { title: 'Option/Result propagation', stdout: 'Saved Review PR\nRejected title empty\nRejected title missing\nNo title\ntrue\n' },
  {
    title: 'Map projections',
    stdout: '[list: "a", "m", "z"]\n[list: 1, 5, 9]\na 1\n3\n[list: <integer>]\n[list: <string>]\n[list: false, true]\n[list: "disabled", "enabled"]\n',
  },
  {
    title: 'Task board across modules',
    stdout: 'Created Review PR\nReview PR true\nRejected task not found\nOriginal size 0\n',
  },
];

for (const fixture of published) {
  test('alpha.12 runs published source: ' + fixture.title, async ({ page }) => {
    await page.goto('./');
    await page.getByRole('button', { name: fixture.title, exact: true }).click();
    await page.getByRole('button', { name: 'Verify code' }).click();
    await expect(page.locator('.terminal-output')).toContainText(
      'Static verification passed', { timeout: 30_000 },
    );
    await page.getByRole('button', { name: 'Run code' }).click();
    await expect(page.locator('.stdout')).toHaveText(fixture.stdout, { timeout: 30_000 });
    await expect(page.locator('.error-panel')).toHaveCount(0);
  });
}

test('alpha.12 duplicate map keys return an atomic error and allow recovery', async ({ page }) => {
  await page.goto('./#code=' + encodeURIComponent(
    'print("before"); bind items = [map: "repeat": 1, "repeat": 2]; print(items);',
  ));
  await page.getByRole('button', { name: 'Verify code' }).click();
  await expect(page.locator('.terminal-output')).toContainText(
    'Static verification passed', { timeout: 30_000 },
  );
  await page.getByRole('button', { name: 'Run code' }).click();
  await expect(page.locator('.error-title')).toContainText('E0082', { timeout: 30_000 });
  await expect(page.locator('.stdout')).toHaveCount(0);
  await page.goto('./#code=' + encodeURIComponent(
    'print(map_keys([map: "z": 9, "a": 1]));',
  ));
  await page.getByRole('button', { name: 'Run code' }).click();
  await expect(page.locator('.stdout')).toHaveText(
    '[list: "a", "z"]\n', { timeout: 30_000 },
  );
});
