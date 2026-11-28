import { expect, test } from '@playwright/test';

function link(main: string, extra: Record<string, string> = {}) {
  return './#project=' + encodeURIComponent(JSON.stringify({
    format: 'scarp-playground-workspace', version: 1,
    workspace: { entry: 'main.srp', files: { 'main.srp': main, ...extra } },
    activeFile: 'main.srp',
  }));
}

async function openPreflight(page: import('@playwright/test').Page) {
  await page.getByRole('button', { name: 'Commands', exact: true }).click();
  const palette = page.getByRole('dialog', { name: 'Command palette' });
  await palette.getByRole('combobox', { name: 'Search commands' }).fill('Project preflight');
  await palette.getByRole('option', { name: /Project preflight/ }).click();
  const panel = page.getByRole('region', { name: 'Project preflight' });
  await expect(panel).toBeVisible();
  return panel;
}

test('missing local module appears as an advisory blocker with exact navigation', async ({ page }) => {
  await page.goto(link('import "missing.srp" as missing;\nprint(1);\n'));
  const panel = await openPreflight(page);
  await expect(panel.getByLabel('Preflight summary')).toContainText('blocker(s)');
  await expect(panel.getByLabel('Project preflight findings')).toContainText('missing-module');
  await panel.getByLabel('Severity').selectOption('blocker');
  await expect(panel.getByLabel('Project preflight findings')).toContainText('missing-module');
  await panel.getByRole('button', { name: 'Open preflight issue in main.srp line 1' }).click();
  await expect(page.locator('.monaco-editor textarea.inputarea')).toBeAttached();
});

test('preflight baseline records introduced and resolved issue identifiers in memory', async ({ page }) => {
  await page.goto(link('print(1);\n'));
  const panel = await openPreflight(page);
  await panel.getByRole('button', { name: 'Capture preflight baseline' }).click();
  await expect(panel).toContainText('Baseline captured');
  await panel.getByRole('button', { name: 'Compare with baseline' }).click();
  await expect(panel.getByLabel('Preflight change summary')).toContainText('0 introduced');
  await panel.getByRole('button', { name: 'Close project preflight' }).click();
  await page.reload();
  const after = await openPreflight(page);
  await expect(after.getByRole('button', { name: 'Compare with baseline' })).toBeDisabled();
});

test('unsupported import notation makes the preflight incomplete without guessing reachability', async ({ page }) => {
  await page.goto(link('import "\\u{61}.srp" as a;\n', {
    'lib/independent.srp': 'print(2);\n',
  }));
  const panel = await openPreflight(page);
  await expect(panel.getByRole('alert')).toContainText('incomplete');
  await expect(panel.getByRole('button', { name: 'Capture preflight baseline' })).toBeDisabled();
  await panel.getByLabel('Category').selectOption('structure');
  await expect(panel.getByLabel('Project preflight findings')).toContainText('incomplete-graph');
});

test('preflight never changes source and remains available in the mobile command palette', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto(link('print(42);\n'));
  await page.keyboard.press('Control+Shift+P');
  const palette = page.getByRole('dialog', { name: 'Command palette' });
  await palette.getByRole('combobox', { name: 'Search commands' }).fill('Project preflight');
  await palette.getByRole('option', { name: /Project preflight/ }).click();
  const panel = page.getByRole('region', { name: 'Project preflight' });
  await expect(panel).toBeVisible();
  await panel.getByRole('button', { name: 'Close project preflight' }).click();
  await page.getByRole('button', { name: 'Run code' }).click();
  await expect(page.locator('.stdout')).toHaveText('42\n', { timeout: 30_000 });
});


test('prioritized review plan links missing imports to source, then requires official Check', async ({ page }) => {
  await page.goto(link('import "missing.srp" as missing;\n// TODO: inspect formatting  \n'));
  const panel = await openPreflight(page);
  const actions = panel.getByLabel('Suggested review sequence');
  await expect(actions).toContainText('Resolve missing source imports');
  await expect(actions).toContainText('Run the official Scarp compiler checks');
  await actions.getByRole('button', {
    name: 'Open first review location for Resolve missing source imports',
  }).click();
  await expect(page.locator('.monaco-editor textarea.inputarea')).toBeAttached();
  await actions.getByRole('button', { name: 'Hide review plan' }).click();
  await expect(actions).not.toContainText('Resolve missing source imports');
  await actions.getByRole('button', { name: 'Show review plan' }).click();
  await expect(actions).toContainText('Resolve missing source imports');
});

test('a source-clean preflight still suggests real Rust compiler verification', async ({ page }) => {
  await page.goto(link('print(42);\n'));
  const panel = await openPreflight(page);
  await expect(panel).toContainText('No preflight blockers detected');
  await expect(panel.getByLabel('Suggested review sequence')).toContainText(
    'Run the official Scarp compiler checks',
  );
});
