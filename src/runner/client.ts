import { validateWorkspace, type Workspace } from '../workspace';
import type { RunResponse, RunResult } from './types';
import { decodeWorkerResult } from './protocol';

const RUN_TIMEOUT_MS = 12_000;
const cancelled: RunResult = {
  ok: false, stdout: '', stderr: '', error: 'Execution cancelled.',
};

/** Run in a disposable worker; abort terminates it instead of accepting stale output. */
export function runWorkspace(workspace: Workspace, signal?: AbortSignal): Promise<RunResult> {
  if (signal?.aborted) return Promise.resolve(cancelled);
  const problem = validateWorkspace(workspace);
  if (problem) {
    return Promise.resolve({ ok: false, stdout: '', stderr: '', error: problem });
  }
  return new Promise((resolve) => {
    const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
    const id = 1;
    let finished = false;
    let timeout: ReturnType<typeof setTimeout> | undefined = undefined;
    const complete = (result: RunResult) => {
      if (finished) return;
      finished = true;
      if (timeout !== undefined) clearTimeout(timeout);
      signal?.removeEventListener('abort', onAbort);
      worker.terminate();
      resolve(result);
    };
    const onAbort = () => complete(cancelled);
    signal?.addEventListener('abort', onAbort, { once: true });
    if (signal?.aborted) {
      complete(cancelled);
      return;
    }
    timeout = setTimeout(() => {
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
      if (event.data?.id === id) complete(decodeWorkerResult(event.data.result));
    };
    worker.onmessageerror = () => complete({
      ok: false, stdout: '', stderr: '',
      error: 'The compiler worker sent a message the browser could not decode.',
    });
    // postMessage itself can fail, e.g. if the browser cannot clone the payload.
    // Never leave a running Worker or unresolved promise in that case.
    try {
      worker.postMessage({ id, workspace });
    } catch {
      complete({
        ok: false, stdout: '', stderr: '',
        error: 'Unable to send the source workspace to the compiler worker.',
      });
    }
  });
}
