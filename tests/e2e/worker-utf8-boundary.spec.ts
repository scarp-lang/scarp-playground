import { expect, test } from '@playwright/test';

test('real compiler Worker rejects UTF-8 continuation-byte navigation offsets', async ({ page }) => {
  await page.goto('./');
  const urls: string[] = [];
  page.on('worker', worker => urls.push(worker.url()));

  await page.getByRole('button', { name: 'Verify code' }).click();
  await expect(page.locator('.terminal-output')).toContainText(
    'Static verification passed.', { timeout: 30_000 },
  );
  const compiler = urls.find(url =>
    /\/worker-[^/]+\.js(?:\?.*)?$/.test(url) && !url.includes('editor.worker'));
  expect(compiler, JSON.stringify(urls)).toBeTruthy();

  const payload = await page.evaluate(async (workerUrl: string) => {
    const source = 'print("😀");\n';
    const bytes = new TextEncoder().encode(source);
    const emoji = bytes.indexOf(0xf0);
    if (emoji < 0) throw Error('Expected UTF-8 emoji sequence not found.');
    const workspace = {
      entry: 'main.srp',
      files: { 'main.srp': source },
    };
    const modes = ['definition', 'references', 'rename'] as const;
    const replies: Array<{ mode: string; offset: number; reply: unknown }> = [];

    async function send(request: unknown): Promise<unknown> {
      return new Promise((resolve, reject) => {
        const worker = new Worker(workerUrl, { type: 'module' });
        const deadline = window.setTimeout(() => {
          worker.terminate();
          reject(new Error('Malformed worker request was not rejected promptly.'));
        }, 7000);
        worker.onmessage = event => {
          window.clearTimeout(deadline);
          worker.terminate();
          resolve(event.data);
        };
        worker.onerror = () => {
          window.clearTimeout(deadline);
          worker.terminate();
          reject(new Error('Malformed worker request unexpectedly crashed.'));
        };
        worker.postMessage(request);
      });
    }

    for (const mode of modes) {
      for (const offset of [emoji + 1, emoji + 2, emoji + 3]) {
        const request = {
          id: 1, workspace, mode, path: 'main.srp', offset,
          ...(mode === 'rename' ? { new_name: 'safe_name' } : {}),
        };
        replies.push({ mode, offset, reply: await send(request) });
      }
    }
    return { replies, source };
  }, compiler!);

  expect(payload.replies).toHaveLength(9);
  for (const item of payload.replies) {
    expect(item.reply).toEqual({
      id: 1,
      [item.mode]: { ok: false, error: 'Invalid Scarp compiler worker request.' },
    });
    expect(JSON.stringify(item.reply)).not.toContain(payload.source);
  }
  await page.getByRole('button', { name: 'Run code' }).click();
  await expect(page.locator('.stdout')).toHaveText(
    'Hello from Scarp!\n', { timeout: 30_000 },
  );
});
