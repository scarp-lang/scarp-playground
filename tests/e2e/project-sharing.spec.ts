import { expect, test } from '@playwright/test';

test('sharing a full project restores modules and active tab without replacing a saved copy', async ({ page }) => {
  // Stub only the clipboard sink; the link parser and Rust WASM interpreter
  // remain real, ensuring no browser permissions or external service is needed.
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: async (text: string) => {
          (window as Window & { __sharedProjectUrl?: string }).__sharedProjectUrl = text;
        },
      },
    });
  });

  await page.goto('./');
  await page.getByRole('button', { name: 'Save locally' }).click();
  await page.getByRole('button', { name: /Import a module/ }).click();
  await page.getByRole('tab', { name: /math.srp/ }).click();
  await page.getByRole('button', { name: /Share/ }).click();
  await expect(page.locator('.notice')).toContainText('shareable project link');
  const sharedUrl = await page.evaluate(() =>
    (window as Window & { __sharedProjectUrl?: string }).__sharedProjectUrl);
  expect(sharedUrl).toContain('#project=');

  await page.goto(sharedUrl!);
  await expect(page.getByRole('tab', { name: /math.srp/ })).toHaveAttribute('aria-selected', 'true');
  await page.getByRole('button', { name: 'Run code' }).click();
  await expect(page.locator('.stdout')).toHaveText('42\n', { timeout: 30_000 });

  // Shared code must not silently replace the opt-in Hello World snapshot.
  await page.goto('./');
  await expect(page.getByRole('tab', { name: /math.srp/ })).toHaveCount(0);
  await page.getByRole('button', { name: 'Run code' }).click();
  await expect(page.locator('.stdout')).toHaveText('Hello from Scarp!\n', { timeout: 30_000 });
});

test('a same-document project fragment replaces only the temporary editor', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: /Import a module/ }).click();
  const payload = {
    format: 'scarp-playground-workspace',
    version: 1,
    workspace: { entry: 'welcome.srp', files: { 'welcome.srp': 'print("From project URL");' } },
    activeFile: 'welcome.srp',
  };
  await page.evaluate((data) => {
    window.location.hash = '#project=' + encodeURIComponent(JSON.stringify(data));
  }, payload);
  await expect(page.getByRole('tab', { name: /welcome.srp/ }))
    .toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('tab', { name: /math.srp/ })).toHaveCount(0);
  await page.getByRole('button', { name: 'Run code' }).click();
  await expect(page.locator('.stdout')).toHaveText('From project URL\n', { timeout: 30_000 });
});
