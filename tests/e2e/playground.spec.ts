import { expect, test } from '@playwright/test';

// These tests deliberately use the built Rust/WASM compiler, not mock responses.
// The preview server serves the same /scarp-playground/ base path as GitHub Pages.
test('boots the real interpreter and executes the official hello sample', async ({ page }) => {
  await page.goto('./');
  await expect(page.getByRole('heading', { name: 'Code. Run. Learn.' })).toBeVisible();
  await expect(page.getByText('Development preview', { exact: true })).toBeVisible();
  // The embedded compiler is pinned independently of Playground's v0.0.1 tag.
  await expect(page.getByText('Scarp v0.0.6-alpha.6', { exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: /Compiler release notes/ }))
    .toHaveAttribute('href', 'https://github.com/scarp-lang/scarp/releases/tag/v0.0.6-alpha.6');
  await page.getByRole('button', { name: 'Run code' }).click();
  await expect(page.locator('.stdout')).toHaveText('Hello from Scarp!\n', { timeout: 30_000 });
  await expect(page.locator('.result-status.success')).toBeVisible();
  await expect(page.locator('.error-panel')).toHaveCount(0);
});

test('checks code using the real compiler without displaying print or eprint output', async ({ page }) => {
  await page.goto('./#code=' + encodeURIComponent('print("should remain silent"); eprint("also silent");'));
  await page.getByRole('button', { name: 'Check code' }).click();
  await expect(page.locator('.terminal-output')).toContainText('Checks passed.', { timeout: 30_000 });
  await expect(page.locator('.stdout')).toHaveCount(0);
  await expect(page.locator('.stderr')).toHaveCount(0);
  await expect(page.locator('.result-status.success')).toBeVisible();
  await page.getByRole('button', { name: 'Run code' }).click();
  await expect(page.locator('.stdout')).toHaveText('should remain silent\n', { timeout: 30_000 });
  await expect(page.locator('.stderr')).toHaveText('also silent\n');
});

test('check returns real diagnostics without publishing partial output', async ({ page }) => {
  await page.goto('./#code=' + encodeURIComponent('print("before"); print(missing);'));
  await page.getByRole('button', { name: 'Check code' }).click();
  await expect(page.locator('.error-title')).toContainText('E0010', { timeout: 30_000 });
  await expect(page.locator('.stdout')).toHaveCount(0);
  await expect(page.locator('.result-status.failure')).toBeVisible();
});

test('compiler numerical RMS works in a real browser worker', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: /Root mean square/ }).click();
  await page.getByRole('button', { name: 'Run code' }).click();
  await expect(page.locator('.stdout')).toHaveText('2.0\n', { timeout: 30_000 });
});

test('runs official alpha.3 Top-K and temperature fixtures in the real WASM interpreter', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: /Top-K score ranking/ }).click();
  await page.getByRole('button', { name: 'Run code' }).click();
  await expect(page.locator('.stdout')).toHaveText(
    '[integer: 1, 2, 4]\n[5.0, 5.0, 3.0]\n[integer: 1, 2]\n[integer:]\n',
    { timeout: 30_000 },
  );
  await page.getByRole('button', { name: /Temperature softmax/ }).click();
  await page.getByRole('button', { name: 'Run code' }).click();
  await expect(page.locator('.stdout')).toHaveText(
    '[0.5, 0.5]\n[0.0]\n[integer: 1, 2, 3]\n',
    { timeout: 30_000 },
  );
});

test('alpha.3 rejects an invalid temperature without partial output and recovers', async ({ page }) => {
  await page.goto('./#code=' + encodeURIComponent('print("before"); print(softmax_temp([1.0], 0.0));'));
  await page.getByRole('button', { name: 'Run code' }).click();
  await expect(page.locator('.error-title')).toContainText('E0034', { timeout: 30_000 });
  await expect(page.locator('.stdout')).toHaveCount(0);
  await page.getByRole('button', { name: /Temperature softmax/ }).click();
  await page.getByRole('button', { name: 'Run code' }).click();
  await expect(page.locator('.stdout')).toHaveText(
    '[0.5, 0.5]\n[0.0]\n[integer: 1, 2, 3]\n',
    { timeout: 30_000 },
  );
});

test('executes published alpha.4 scientific examples through the real WASM worker', async ({ page }) => {
  await page.goto('./');
  const cases = [
    ['Sampled calculus', '9.0\n[2.0, 2.0]\n'],
    ['Cumulative sampled area', '[0.0, 1.0, 9.0, 16.0]\n16.0\n'],
    ['Cosine similarity', '1.0\n0.0\n-1.0\n'],
  ] as const;
  for (const [name, expected] of cases) {
    await page.getByRole('button', { name: new RegExp(name) }).click();
    await page.getByRole('button', { name: 'Run code' }).click();
    await expect(page.locator('.stdout')).toHaveText(expected, { timeout: 30_000 });
    await expect(page.locator('.result-status.success')).toBeVisible();
  }
});

test('alpha.4 rejects zero-vector cosine inputs atomically and recovers', async ({ page }) => {
  await page.goto('./#code=' + encodeURIComponent('print("before"); print(cosine_similarity([0.0, 0.0], [1.0, 2.0]));'));
  await page.getByRole('button', { name: 'Run code' }).click();
  await expect(page.locator('.result-status.failure')).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('.stdout')).toHaveCount(0);
  await page.getByRole('button', { name: /Cosine similarity/ }).click();
  await page.getByRole('button', { name: 'Run code' }).click();
  await expect(page.locator('.stdout')).toHaveText('1.0\n0.0\n-1.0\n', { timeout: 30_000 });
});

test('runs the exact published alpha.5 Top-P and Pearson fixtures in real WASM', async ({ page }) => {
  await page.goto('./');
  const cases = [
    ['Top-P nucleus ranking', '[integer: 0, 1]\n[0.5, 0.25]\n[integer: 0, 1, 2]\n[integer: 1, 2]\n'],
    ['Pearson correlation', '1.0\n-1.0\n0.0\n'],
  ] as const;
  for (const [name, expected] of cases) {
    await page.getByRole('button', { name: new RegExp(name) }).click();
    await page.getByRole('button', { name: 'Run code' }).click();
    await expect(page.locator('.stdout')).toHaveText(expected, { timeout: 30_000 });
    await expect(page.locator('.result-status.success')).toBeVisible();
  }
});

test('alpha.5 rejects invalid Top-P and zero-variance Pearson atomically, then recovers', async ({ page }) => {
  const invalidPrograms = [
    'print("before"); print(top_p([0.5, 0.25, 0.25], 0.0));',
    'print("before"); print(pearson_correlation([1.0, 1.0], [1.0, 2.0]));',
  ];
  for (const source of invalidPrograms) {
    await page.goto('./#code=' + encodeURIComponent(source));
    await page.getByRole('button', { name: 'Run code' }).click();
    await expect(page.locator('.error-title')).toContainText('E0034', { timeout: 30_000 });
    await expect(page.locator('.stdout')).toHaveCount(0);
    await expect(page.locator('.result-status.failure')).toBeVisible();
    await page.getByRole('button', { name: /Pearson correlation/ }).click();
    await page.getByRole('button', { name: 'Run code' }).click();
    await expect(page.locator('.stdout')).toHaveText('1.0\n-1.0\n0.0\n', { timeout: 30_000 });
  }
});

test('imports and executes another .srp source file in the real module loader', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: /Import a module/ }).click();
  await expect(page.getByRole('tab', { name: /math.srp/ })).toBeVisible();
  await page.getByRole('button', { name: 'Run code' }).click();
  await expect(page.locator('.stdout')).toHaveText('42\n', { timeout: 30_000 });
  await expect(page.locator('.result-status.success')).toBeVisible();
});

test('reports a real schema-1 compiler diagnostic for an unknown identifier', async ({ page }) => {
  await page.goto('./#code=' + encodeURIComponent('print(unknown_variable);'));
  await page.getByRole('button', { name: 'Run code' }).click();
  await expect(page.locator('.error-title')).toContainText('E0010', { timeout: 30_000 });
  await expect(page.locator('.error-title')).toContainText('main.srp:1:');
  await expect(page.locator('.result-status.failure')).toBeVisible();
  await expect(page.locator('.stdout')).toHaveCount(0);
});

test('the interpreter enforces its work budget without freezing the browser', async ({ page }) => {
  const longProgram = 'var n = 0; while n < 1000000 { n += 1; }';
  await page.goto('./#code=' + encodeURIComponent(longProgram));
  await page.getByRole('button', { name: 'Run code' }).click();
  await expect(page.locator('.error-title')).toContainText('E0017', { timeout: 30_000 });
  await expect(page.getByRole('button', { name: 'Run code' })).toBeEnabled();
});

test('theme switch is interactive and persists after reload', async ({ page }) => {
  await page.goto('./');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.getByRole('button', { name: 'Switch to light theme' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.getByRole('button', { name: 'Switch to dark theme' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
});

test('supports a narrow mobile viewport without hiding execution controls', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('./');
  await expect(page.getByRole('button', { name: 'Run code' })).toBeVisible();
  await expect(page.getByRole('tab', { name: /main.srp/ })).toBeVisible();
  await page.getByRole('button', { name: 'Run code' }).click();
  await expect(page.locator('.stdout')).toHaveText('Hello from Scarp!\n', { timeout: 30_000 });
  const rootWidth = await page.locator('body').evaluate((element) => element.scrollWidth);
  expect(rootWidth).toBeLessThanOrEqual(375);
});

test('Monaco remains editable, and changed source is executed by real Scarp', async ({ page }) => {
  await page.goto('./');
  const editor = page.locator('.monaco-editor textarea.inputarea');
  await expect(editor).toBeAttached();
  await editor.focus();
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.insertText('print("Editor still works");');
  await page.getByRole('button', { name: 'Run code' }).click();
  await expect(page.locator('.stdout')).toHaveText('Editor still works\n', { timeout: 30_000 });
});

test('opt-in save restores multi-file sources and the selected tab after reload', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: /Import a module/ }).click();
  await page.getByRole('tab', { name: /math.srp/ }).click();
  await page.getByRole('button', { name: 'Save locally' }).click();
  await expect(page.getByRole('button', { name: 'Forget saved copy' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('tab', { name: /math.srp/ })).toHaveAttribute('aria-selected', 'true');
  await page.getByRole('button', { name: 'Run code' }).click();
  await expect(page.locator('.stdout')).toHaveText('42\n', { timeout: 30_000 });
});

test('a shared URL does not erase the separately saved browser workspace', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: /Import a module/ }).click();
  await page.getByRole('button', { name: 'Save locally' }).click();
  await page.goto('./#code=' + encodeURIComponent('print("URL takes precedence");'));
  await expect(page.getByRole('tab', { name: /math.srp/ })).toHaveCount(0);
  await page.getByRole('button', { name: 'Run code' }).click();
  await expect(page.locator('.stdout')).toHaveText('URL takes precedence\n', { timeout: 30_000 });
  await page.goto('./');
  await expect(page.getByRole('tab', { name: /math.srp/ })).toBeVisible();
  await page.getByRole('button', { name: 'Run code' }).click();
  await expect(page.locator('.stdout')).toHaveText('42\n', { timeout: 30_000 });
});

test('switching built-in examples preserves saved projects until explicitly saved again', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: /Import a module/ }).click();
  await page.getByRole('tab', { name: /math.srp/ }).click();
  await page.getByRole('button', { name: 'Save locally' }).click();
  const originalSnapshot = await page.evaluate(() =>
    localStorage.getItem('scarp-playground-workspace-v1'));
  expect(originalSnapshot).not.toBeNull();

  // A new example is temporary; the previously saved multi-file project must
  // not be silently replaced by the 350ms autosave debounce.
  await page.getByRole('button', { name: /Cosine similarity/ }).click();
  await expect(page.locator('.notice')).toContainText('locally saved workspace is preserved');
  await expect(page.getByRole('button', { name: 'Save locally' })).toBeVisible();
  await page.waitForTimeout(600);
  expect(await page.evaluate(() =>
    localStorage.getItem('scarp-playground-workspace-v1'))).toBe(originalSnapshot);

  await page.reload();
  await expect(page.getByRole('tab', { name: /math.srp/ })).toHaveAttribute('aria-selected', 'true');
  await page.getByRole('button', { name: 'Run code' }).click();
  await expect(page.locator('.stdout')).toHaveText('42\n', { timeout: 30_000 });

  // Intentional replacement still works: Save locally is the explicit opt-in.
  await page.getByRole('button', { name: /Sampled calculus/ }).click();
  await page.getByRole('button', { name: 'Save locally' }).click();
  await page.reload();
  await expect(page.getByRole('tab', { name: /math.srp/ })).toHaveCount(0);
  await page.getByRole('button', { name: 'Run code' }).click();
  await expect(page.locator('.stdout')).toHaveText('9.0\n[2.0, 2.0]\n', { timeout: 30_000 });
});

test('forgetting browser storage retains the open code but not its next-session copy', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: /Import a module/ }).click();
  await page.getByRole('button', { name: 'Save locally' }).click();
  page.once('dialog', (dialog) => void dialog.accept());
  await page.getByRole('button', { name: 'Forget saved copy' }).click();
  await expect(page.getByRole('tab', { name: /math.srp/ })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('tab', { name: /math.srp/ })).toHaveCount(0);
});


test('keeps the main file undo history when switching to another Scarp module', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: /Import a module/ }).click();
  const editor = page.locator('.monaco-editor textarea.inputarea');
  await expect(editor).toBeAttached();
  await editor.focus();
  await page.keyboard.press('ControlOrMeta+End');
  // Use a real keypress rather than Playwright insertText, which bypasses
  // keydown/keyup and does not reliably create a Monaco keyboard undo entry.
  await page.keyboard.press('x');
  await expect(page.locator('.monaco-editor .view-lines')).toContainText('x');
  await page.getByRole('tab', { name: /math.srp/ }).click();
  await page.getByRole('tab', { name: /main.srp/ }).click();
  await editor.focus();
  await page.keyboard.press('ControlOrMeta+Z');
  await expect(page.locator('.monaco-editor .view-lines')).not.toContainText('x');
  await page.getByRole('button', { name: 'Run code' }).click();
  await expect(page.locator('.stdout')).toHaveText('42\n', { timeout: 30_000 });
});

test('opens an imported module at a real compiler diagnostic', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: /Import a module/ }).click();
  await page.getByRole('tab', { name: /math.srp/ }).click();
  const editor = page.locator('.monaco-editor textarea.inputarea');
  await expect(editor).toBeAttached();
  await editor.focus();
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.insertText(
    'pub pure funcra twice(n: integer) -> integer { return missing; }\n',
  );
  await page.getByRole('tab', { name: /main.srp/ }).click();
  await page.getByRole('button', { name: 'Run code' }).click();
  await expect(page.locator('.error-title')).toContainText('E0010', { timeout: 30_000 });
  await expect(page.locator('.error-title')).toContainText('math.srp');
  await expect(page.getByRole('tab', { name: /math.srp/ }))
    .toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('button', { name: 'Go to error in math.srp' })).toBeVisible();
  await expect(page.locator('.monaco-editor .squiggly-error').first()).toBeVisible();
});

test('clears stale source markers when editing after a real compiler error', async ({ page }) => {
  await page.goto('./#code=' + encodeURIComponent('print("😀"); print(missing);'));
  await page.getByRole('button', { name: 'Run code' }).click();
  await expect(page.locator('.error-title')).toContainText('E0010', { timeout: 30_000 });
  await expect(page.locator('.monaco-editor .squiggly-error').first()).toBeVisible();
  const editor = page.locator('.monaco-editor textarea.inputarea');
  await editor.focus();
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.insertText('print("repaired");');
  await expect(page.locator('.error-title')).toHaveCount(0);
  await expect(page.locator('.monaco-editor .squiggly-error')).toHaveCount(0);
  await page.getByRole('button', { name: 'Run code' }).click();
  await expect(page.locator('.stdout')).toHaveText('repaired\n', { timeout: 30_000 });
});


test('downloads a multi-file JSON workspace and reimports it for real Scarp execution', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: /Import a module/ }).click();
  await page.getByRole('tab', { name: /math.srp/ }).click();
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export project' }).click();
  const download = await pending;
  expect(download.suggestedFilename()).toBe('scarp-workspace.json');
  await page.goto('./#code=' + encodeURIComponent('print("before import");'));
  await expect(page.getByRole('tab', { name: /math.srp/ })).toHaveCount(0);
  page.once('dialog', (dialog) => void dialog.accept());
  await page.locator('input[aria-label="Import project JSON"]').setInputFiles((await download.path())!);
  await expect(page.getByRole('tab', { name: /math.srp/ })).toHaveAttribute('aria-selected', 'true');
  await page.getByRole('button', { name: 'Run code' }).click();
  await expect(page.locator('.stdout')).toHaveText('42\n', { timeout: 30_000 });
});

test('rejects invalid project files and never overwrites an opt-in saved copy on import', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: /Import a module/ }).click();
  await page.getByRole('button', { name: 'Save locally' }).click();

  await page.locator('input[aria-label="Import project JSON"]')
    .setInputFiles('tests/fixtures/unsafe-project.json');
  await expect(page.locator('.notice')).toContainText('Invalid Scarp workspace JSON');
  await expect(page.getByRole('tab', { name: /math.srp/ })).toBeVisible();

  page.once('dialog', (dialog) => void dialog.accept());
  await page.locator('input[aria-label="Import project JSON"]')
    .setInputFiles('tests/fixtures/temporary-project.json');
  await expect(page.getByRole('tab', { name: /math.srp/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Save locally' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('tab', { name: /math.srp/ })).toBeVisible();
  await page.getByRole('button', { name: 'Run code' }).click();
  await expect(page.locator('.stdout')).toHaveText('42\n', { timeout: 30_000 });
});


test('editing while the actual compiler loads cancels stale execution and permits a fresh run', async ({ page }) => {
  // Delay delivery of the genuine WASM loader, not its result. The first worker
  // remains in flight until the user edits; its request is then cancelled.
  let unblock!: () => void;
  let entered!: () => void;
  const blocked = new Promise<void>((resolve) => { unblock = resolve; });
  const loaderRequested = new Promise<void>((resolve) => { entered = resolve; });
  let held = false;
  await page.route('**/compiler/scarp_playground_wasm.js', async (route) => {
    if (!held) {
      held = true;
      entered();
      await blocked;
      try { await route.continue(); } catch { /* first worker was terminated */ }
    } else {
      await route.continue();
    }
  });

  await page.goto('./#code=' + encodeURIComponent('print(missing);'));
  const editor = page.locator('.monaco-editor textarea.inputarea');
  await expect(editor).toBeAttached();
  await page.getByRole('button', { name: 'Run code' }).click();
  try {
    await loaderRequested;
    await expect(page.getByRole('button', { name: 'Stop run' })).toBeVisible();
    await editor.focus();
    await page.keyboard.press('ControlOrMeta+A');
    await page.keyboard.insertText('print("fresh");');
    await expect(page.getByRole('button', { name: 'Run code' })).toBeVisible();
    await expect(page.locator('.error-title')).toHaveCount(0);
  } finally {
    unblock();
  }
  await page.getByRole('button', { name: 'Run code' }).click();
  await expect(page.locator('.stdout')).toHaveText('fresh\n', { timeout: 30_000 });
  await expect(page.locator('.error-title')).toHaveCount(0);
});

test('Stop run terminates a genuinely pending compiler and keeps the next execution available', async ({ page }) => {
  let releaseLoader!: () => void;
  let loaderArrived!: () => void;
  const held = new Promise<void>((resolve) => { releaseLoader = resolve; });
  const requested = new Promise<void>((resolve) => { loaderArrived = resolve; });
  let first = true;
  await page.route('**/compiler/scarp_playground_wasm.js', async (route) => {
    if (first) {
      first = false;
      loaderArrived();
      await held;
      try { await route.continue(); } catch { /* cancelled worker closed its request */ }
    } else {
      await route.continue();
    }
  });

  await page.goto('./#code=' + encodeURIComponent('var n = 0; while n < 1000000 { n += 1; }'));
  await page.getByRole('button', { name: 'Run code' }).click();
  try {
    await requested;
    await page.getByRole('button', { name: 'Stop run' }).click();
    await expect(page.getByRole('button', { name: 'Run code' })).toBeEnabled();
    await expect(page.locator('.result-status')).toHaveCount(0);
  } finally {
    releaseLoader();
  }

  // The next run still uses the authentic interpreter and work-budget checks.
  await page.getByRole('button', { name: 'Run code' }).click();
  await expect(page.locator('.error-title')).toContainText('E0017', { timeout: 30_000 });
});
