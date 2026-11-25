import { writeFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { compilerCompatibility } from './support/compiler-compatibility';

type Scenario = { label: string; source: string; stdout: string } |
  { label: string; source: string; error: string };

const scenarios: Scenario[] = [
  {
    label: 'signed-2048-digit-roundtrip',
    source: 'bind n=bigint(text_concat("-",text_repeat("9",2048))); print(n);',
    stdout: '-' + '9'.repeat(2048) + '\n',
  },
  {
    label: '1024-by-1024-digit-product',
    source: 'bind n=bigint(text_repeat("9",1024)); print(n*n);',
    stdout: '9'.repeat(1023) + '8' + '0'.repeat(1023) + '1\n',
  },
  {
    label: 'raw-digit-limit',
    source: 'print("before"); print(bigint(text_repeat("9",2049)));',
    error: 'E0052',
  },
  {
    label: 'leading-zero-digit-limit',
    source: 'print("before"); print(bigint(text_repeat("0",2049)));',
    error: 'E0052',
  },
  {
    label: 'carry-beyond-digit-limit',
    source: 'print("before"); print(bigint(text_repeat("9",2048)) + bigint("1"));',
    error: 'E0052',
  },
  {
    label: 'division-work-limit',
    source: 'bind a=bigint(text_repeat("9",2048)); bind b=bigint(text_repeat("7",1024)); print("before"); print(a/b);',
    error: 'E0017',
  },
  {
    label: 'recovery',
    source: 'print(bigint("9223372036854775808") + bigint("1"));',
    stdout: '9223372036854775809\n',
  },
];

for (const scenario of scenarios) {
  test('BigInt capacity: ' + scenario.label, async ({ page, browserName }, testInfo) => {
    await page.goto('./#code=' + encodeURIComponent(scenario.source));
    await page.getByRole('button', { name: 'Verify code' }).click();
    await expect(page.locator('.terminal-output')).toContainText('Static verification passed.', { timeout: 30_000 });
    await expect(page.locator('.stdout')).toHaveCount(0);

    await page.getByRole('button', { name: 'Check code' }).click();
    if ('error' in scenario) {
      await expect(page.locator('.error-title')).toContainText(scenario.error, { timeout: 30_000 });
    } else {
      await expect(page.locator('.terminal-output')).toContainText('Checks passed.', { timeout: 30_000 });
    }
    await expect(page.locator('.stdout')).toHaveCount(0);

    await page.getByRole('button', { name: 'Run code' }).click();
    if ('error' in scenario) {
      await expect(page.locator('.error-title')).toContainText(scenario.error, { timeout: 30_000 });
      await expect(page.locator('.stdout')).toHaveCount(0);
      await expect(page.locator('.stderr')).toHaveCount(0);
    } else {
      await expect(page.locator('.stdout')).toHaveText(scenario.stdout, { timeout: 30_000 });
      // Exact textContent includes the trailing newline (toHaveText normalizes whitespace).
      expect(await page.locator('.stdout').textContent()).toBe(scenario.stdout);
      await expect(page.locator('.result-status.success')).toBeVisible();
    }

    const stats = page.getByLabel('Browser operation statistics');
    await expect(stats).toBeVisible();
    const evidence = {
      compiler: compilerCompatibility,
      browser: browserName,
      scenario: scenario.label,
      expected: 'error' in scenario ? { diagnosticCode: scenario.error } :
        { stdoutUtf8Bytes: new TextEncoder().encode(scenario.stdout).byteLength },
      browserTurnaround: await stats.locator('dd').first().textContent(),
      measurementScope: 'Main-thread turnaround includes compiler loading and delivery; not CPU or memory.',
    };
    const json = JSON.stringify(evidence, null, 2) + '\n';
    writeFileSync(testInfo.outputPath('bigint-capacity.json'), json);
    await testInfo.attach('bigint-capacity.json', { body: Buffer.from(json), contentType: 'application/json' });
  });
}
