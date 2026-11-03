import { validateWorkspace, type Workspace } from '../workspace';
import type { RunResponse, RunResult } from './types';

const RUN_TIMEOUT_MS = 12_000;

/** Run in a disposable worker; never execute user code on the React thread. */
export function runWorkspace(workspace: Workspace): Promise<RunResult> {
  const problem = validateWorkspace(workspace);
  if (problem) {
    return Promise.resolve({ ok: false, stdout: '', stderr: '', error: problem });
  }
  return new Promise((resolve) => {
    const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
    const id = 1;
    let finished = false;
    const complete = (result: RunResult) => {
      if (finished) return;
      finished = true;
      clearTimeout(timeout);
      worker.terminate();
      resolve(result);
    };
    const timeout = setTimeout(() => {
      complete({
        ok: false,
        stdout: '',
        stderr: '',
        error: 'Execution exceeded the 12-second browser limit and was stopped.',
      });
    }, RUN_TIMEOUT_MS);
    worker.onerror = (event) => {
      event.preventDefault();
      complete({
        ok: false,
        stdout: '',
        stderr: '',
        error: 'The compiler worker failed to load or crashed. See the browser console.',
      });
    };
    worker.onmessage = (event: MessageEvent<RunResponse>) => {
      if (event.data.id === id) complete(event.data.result);
    };
    worker.postMessage({ id, workspace });
  });
}
