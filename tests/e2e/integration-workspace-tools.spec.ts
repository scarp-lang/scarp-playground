import { expect, test } from '@playwright/test';

const projectLink = (main: string) => './#project=' + encodeURIComponent(JSON.stringify({
  format: 'scarp-playground-workspace',
  version: 1,
  workspace: {
    entry: 'main.srp',
    files: {
      'main.srp': main,
      'lib/math.srp': 'pub bind answer = 42;',
    },
  },
  activeFile: 'main.srp',
}));

test('repair, execute, search output, capture snapshot and undo in one browser session', async ({ page }) => {
  const code = 'import "missing/math.srp" as math;\nprint(math.answer);\n';
  await page.goto(projectLink(code));

  await page.getByRole('button', { name: 'Repair imports' }).click();
  const repair = page.getByRole('region', { name: 'Missing import repair' });
  await expect(repair.getByLabel('Import repair summary')).toContainText('1 missing import(s)');
  await repair.getByLabel('Target for missing import in main.srp line 1')
    .selectOption('lib/math.srp');
  await repair.getByRole('button', { name: 'Preview selected repairs' }).click();
  await expect(repair.getByLabel('Reviewed import repairs'))
    .toContainText('lib/math.srp');
  page.once('dialog', dialog => void dialog.accept());
  await repair.getByRole('button', { name: 'Apply reviewed import repairs' }).click();

  await page.getByRole('button', { name: 'Run code' }).click();
  await expect(page.locator('.stdout')).toHaveText('42\n', { timeout: 30_000 });

  await page.getByRole('button', { name: 'Find in output' }).click();
  const output = page.getByRole('region', { name: 'Search captured program output' });
  await output.getByLabel('Literal output text').fill('42');
  await output.getByRole('button', { name: 'Find output matches' }).click();
  await expect(output.getByLabel('Output search summary')).toContainText('1 match(es)');
  await expect(output.getByLabel('Output search matches').locator('mark')).toHaveText('42');
  await output.getByRole('button', { name: 'Close output search' }).click();

  await page.getByRole('button', { name: 'Source timeline' }).click();
  const timeline = page.getByRole('region', { name: 'Source snapshot timeline' });
  await timeline.getByLabel('New snapshot name').fill('Working import');
  await timeline.getByRole('button', { name: 'Capture current source' }).click();
  await expect(timeline).toContainText('Working import');
  await timeline.getByRole('button', { name: 'Close source timeline' }).click();

  await page.getByRole('button', { name: 'Undo bulk change' }).click();
  await page.getByRole('button', { name: 'Repair imports' }).click();
  await expect(repair.getByLabel('Import repair summary')).toContainText('1 missing import(s)');
  await expect(repair).toContainText('missing/math.srp');
});

test('source tasks, private annotations and advanced search coexist without source mutation', async ({ page }) => {
  const code = '// TODO: explain this import\n' +
    'import "lib/math.srp" as math;\n' +
    '// FIXME: investigate expression\nprint(math.answer);\n';
  await page.goto(projectLink(code));

  await page.getByRole('button', { name: 'Source tasks', exact: true }).click();
  const tasks = page.getByRole('region', { name: 'Source task explorer' });
  await expect(tasks.getByLabel('Source task summary')).toContainText('2 tagged comments');
  const todo = tasks.locator('.source-task-item').filter({ hasText: 'explain this import' });
  await todo.getByRole('checkbox', { name: 'Reviewed' }).check();
  await expect(tasks.getByLabel('Source task summary')).toContainText('1 reviewed');
  await tasks.getByRole('button', { name: 'Close source tasks' }).click();

  await page.getByRole('button', { name: 'Source notes', exact: true }).click();
  const notes = page.getByRole('region', { name: 'Session source notes' });
  await notes.getByLabel('Line', { exact: true }).fill('4');
  await notes.getByLabel('Note title').fill('Understand answer');
  await notes.getByLabel('Private note text').fill('Check exported binding');
  await notes.getByRole('button', { name: 'Add source note' }).click();
  await expect(notes.getByLabel('Source notes summary')).toContainText('1/32 notes');
  await notes.getByRole('button', { name: 'Close source notes' }).click();

  await page.getByRole('button', { name: 'Advanced search', exact: true }).click();
  const search = page.getByRole('region', { name: 'Advanced source search' });
  await search.getByLabel('Literal search expression').fill('"print(math.answer)"');
  await search.getByRole('button', { name: 'Search sources' }).click();
  await expect(search.getByLabel('Advanced search summary')).toContainText('1 result(s)');
  await search.getByRole('button', { name: /Open match in main.srp line 4/ }).click();

  await page.getByRole('button', { name: 'Source tasks', exact: true }).click();
  await expect(tasks.getByLabel('Source task summary')).toContainText('1 reviewed');
  await page.getByRole('button', { name: 'Source notes', exact: true }).click();
  await expect(notes.getByText('Understand answer', { exact: true })).toBeVisible();
});

test('integration retains the compiler as the execution authority', async ({ page }) => {
  const code = 'import "lib/math.srp" as math;\nprint(math.answer);\n';
  await page.goto(projectLink(code));
  await page.getByRole('button', { name: 'Verify code' }).click();
  await expect(page.locator('.terminal-output')).toContainText(
    'Static verification passed.', { timeout: 30_000 },
  );
  await page.getByRole('button', { name: 'Run code' }).click();
  await expect(page.locator('.stdout')).toHaveText('42\n', { timeout: 30_000 });
  await expect(page.locator('.stderr')).toHaveCount(0);
});
