import { expect, test } from '@playwright/test';

test('real bundled Worker rejects forged operation modes before compiler execution', async ({ page }) => {
  await page.goto('./');
  const workerUrls: string[] = [];
  page.on('worker', worker => workerUrls.push(worker.url()));
  await page.getByRole('button', { name: 'Verify code' }).click();
  await expect(page.locator('.terminal-output')).toContainText(
    'Static verification passed.', { timeout: 30_000 },
  );

  // Capture the *real* built compiler Worker, not Monaco's editor Worker.
  const compilerUrl = workerUrls.find(url =>
    /\/worker-[^/]+\.js(?:\?.*)?$/.test(url) && !url.includes('editor.worker'));
  expect(compilerUrl, JSON.stringify(workerUrls)).toBeTruthy();

  const replies = await page.evaluate(async (url: string) => {
    async function send(payload: unknown): Promise<unknown> {
      return new Promise((resolve, reject) => {
        const worker = new Worker(url, { type: 'module' });
        const timeout = window.setTimeout(() => {
          worker.terminate();
          reject(new Error('Invalid worker request was not rejected promptly'));
        }, 7000);
        worker.onmessage = event => {
          window.clearTimeout(timeout);
          worker.terminate();
          resolve(event.data);
        };
        worker.onerror = () => {
          window.clearTimeout(timeout);
          worker.terminate();
          reject(new Error('Invalid Worker request unexpectedly crashed the Worker'));
        };
        worker.postMessage(payload);
      });
    }
    const workspace = {
      entry: 'main.srp',
      files: { 'main.srp': 'print("MUST_NOT_EXECUTE");' },
    };
    const forgedMode = await send({ id: 1, workspace, mode: 'unknown' });
    const forgedDefinition = await send({
      id: 1, workspace, mode: 'definition', path: '../../escape.srp', offset: -1,
    });
    const badInput = await send({
      id: 1, workspace, mode: 'run', stdin: '😀'.repeat(5000),
    });
    return { forgedMode, forgedDefinition, badInput };
  }, compilerUrl!);

  expect(replies.forgedMode).toEqual({
    id: 1, result: {
      ok: false, stdout: '', stderr: '',
      error: 'Invalid Scarp compiler worker request.',
    },
  });
  expect(replies.forgedDefinition).toEqual({
    id: 1, definition: { ok: false, error: 'Invalid Scarp compiler worker request.' },
  });
  expect(replies.badInput).toEqual({
    id: 1, result: {
      ok: false, stdout: '', stderr: '',
      error: 'Invalid Scarp compiler worker request.',
    },
  });

  // Forged messages did not modify the page or poison a later actual Run.
  await page.getByRole('button', { name: 'Run code' }).click();
  await expect(page.locator('.stdout')).toHaveText(
    'Hello from Scarp!\n', { timeout: 30_000 },
  );
});

test('malformed shared project is discarded, never coerced into executable source', async ({ page }) => {
  const invalid = {
    format: 'scarp-playground-workspace',
    version: 1,
    workspace: { entry: 'main.srp', files: { 'main.srp': 123 } },
    activeFile: 'main.srp',
  };
  await page.goto('./#project=' + encodeURIComponent(JSON.stringify(invalid)));
  await page.getByRole('button', { name: 'Run code' }).click();
  await expect(page.locator('.stdout')).toHaveText(
    'Hello from Scarp!\n', { timeout: 30_000 },
  );
});
