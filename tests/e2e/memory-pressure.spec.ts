import { writeFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { readChromiumProcessRss, readPageJsHeap } from './support/chromium-memory';

// This test runs the real pinned Rust/WASM interpreter in Chromium. Measured
// Linux RSS sums can count shared pages more than once; page JS heap excludes
// Worker JS heap and WebAssembly linear memory. These are observations, NOT
// security limits, and the test does not intentionally cause an OS-level OOM.
test('records browser memory while bounded failures recover with no retained compiler workers', async ({
  page, browser,
}, testInfo) => {
  await page.addInitScript(() => {
    type State = { started: number; terminated: number; active: number; peakActive: number };
    const state: State = { started: 0, terminated: 0, active: 0, peakActive: 0 };
    const marked = new WeakSet<Worker>();
    const active = new Set<Worker>();
    const send = Worker.prototype.postMessage;
    const terminate = Worker.prototype.terminate;
    const trackedWindow = window as Window & { __scarpCompilerWorkers?: State };
    trackedWindow.__scarpCompilerWorkers = state;

    Worker.prototype.postMessage = function (payload: unknown, ...additional: unknown[]) {
      const message = payload as { mode?: unknown; workspace?: unknown } | null;
      if (message && (message.mode === 'run' || message.mode === 'check' ||
          message.mode === 'definition') && message.workspace &&
          typeof message.workspace === 'object' && !marked.has(this)) {
        marked.add(this);
        active.add(this);
        state.started += 1;
        state.active = active.size;
        state.peakActive = Math.max(state.peakActive, state.active);
      }
      return Reflect.apply(send, this, [payload, ...additional]);
    };
    Worker.prototype.terminate = function (...additional: unknown[]) {
      if (active.delete(this)) {
        state.terminated += 1;
        state.active = active.size;
      }
      return Reflect.apply(terminate, this, additional);
    };
  });

  await page.goto('./');
  const editor = page.locator('.monaco-editor textarea.inputarea');
  await expect(editor).toBeAttached({ timeout: 30_000 });

  type Sample = {
    step: string;
    pageJsHeapBytes: number | null;
    chromiumRss: Awaited<ReturnType<typeof readChromiumProcessRss>>;
    started: number;
    terminated: number;
    active: number;
    peakActive: number;
  };
  const samples: Sample[] = [];
  const measure = async (step: string) => {
    const workers = await page.evaluate(() => {
      const monitored = window as Window & {
        __scarpCompilerWorkers?: {
          started: number; terminated: number; active: number; peakActive: number;
        };
      };
      return monitored.__scarpCompilerWorkers ?? null;
    });
    expect(workers, 'compiler Worker instrumentation must be present').not.toBeNull();
    samples.push({
      step,
      pageJsHeapBytes: await readPageJsHeap(page),
      chromiumRss: await readChromiumProcessRss(browser),
      ...workers!,
    });
  };

  await measure('after-editor-load');

  const cases: Array<{ label: string; source: string; stdout?: string; error?: string }> = [
    {
      label: 'initial-run',
      source: 'print("warm up");',
      stdout: 'warm up\n',
    },
    {
      label: 'print-statement-pressure',
      source: 'repeat 1200 as index { print("x"); }',
      error: 'E0018',
    },
    {
      label: 'recover-after-print-pressure',
      source: 'print("output quota recovered");',
      stdout: 'output quota recovered\n',
    },
    {
      label: 'buffered-output-pressure',
      source: 'bind chunk = text_repeat("x", 60000); repeat 20 as index { print(chunk); }',
      error: 'E0029',
    },
    {
      label: 'recover-after-buffered-output',
      source: 'print("buffer recovered");',
      stdout: 'buffer recovered\n',
    },
    {
      label: 'recursive-call-pressure',
      source: [
        'pure funcra dive(n: integer) -> integer {',
        'if n == 0 { return 0; }',
        'return 1 + dive(n - 1);',
        '}',
        'print("before"); print(dive(1000));',
      ].join(' '),
      error: 'E0027',
    },
    {
      label: 'recover-after-call-pressure',
      source: 'print("frames recovered");',
      stdout: 'frames recovered\n',
    },
  ];

  for (const scenario of cases) {
    await editor.focus();
    await page.keyboard.press('ControlOrMeta+A');
    await page.keyboard.insertText(scenario.source);
    await page.getByRole('button', { name: 'Run code' }).click();
    if (scenario.error) {
      await expect(page.locator('.error-title')).toContainText(scenario.error, {
        timeout: 30_000,
      });
      await expect(page.locator('.stdout')).toHaveCount(0);
    } else {
      await expect(page.locator('.stdout')).toHaveText(scenario.stdout!, {
        timeout: 30_000,
      });
      await expect(page.locator('.error-panel')).toHaveCount(0);
    }
    await expect.poll(() => page.evaluate(() => {
      const state = (window as Window & {
        __scarpCompilerWorkers?: { active: number };
      }).__scarpCompilerWorkers;
      return state?.active ?? -1;
    }), { timeout: 10_000 }).toBe(0);
    await measure(scenario.label);
  }

  const last = samples.at(-1)!;
  expect(last.started).toBe(cases.length);
  expect(last.terminated).toBe(cases.length);
  expect(last.peakActive).toBe(1);
  expect(samples.every((sample) => sample.active === 0)).toBe(true);
  expect(samples.every((sample) =>
    sample.pageJsHeapBytes === null ||
    (Number.isSafeInteger(sample.pageJsHeapBytes) && sample.pageJsHeapBytes >= 0))).toBe(true);

  // Produce inspectable measurements rather than asserting a fabricated
  // process-memory maximum. CI variance and cross-process RSS double counting
  // make a fixed RSS threshold misleading.
  const evidence = {
    compilerPin: 'v0.0.6-alpha.2 (immutable bridge/Cargo.lock)',
    browser: 'Chromium',
    scope: {
      pageJsHeap: 'Chromium page process JS heap only; excludes Worker and WASM allocations',
      linuxRss: 'sum of Chromium processes reported by CDP; shared RSS may be counted twice',
      memoryCap: 'not measured or certified',
    },
    samples,
  };
  const json = JSON.stringify(evidence, null, 2) + '\n';
  writeFileSync(testInfo.outputPath('chromium-memory-pressure.json'), json);
  await testInfo.attach('chromium-memory-pressure.json', {
    body: Buffer.from(json, 'utf8'),
    contentType: 'application/json',
  });
  console.info(
    'Scarp Chromium memory telemetry: ' + samples.length +
    ' observations, ' + last.started + ' compiler Workers terminated, peak ' +
    last.peakActive + ' active',
  );
});
