import { validateWorkspace, type Workspace } from '../workspace';
import type { RunResponse, RunResult } from './types';
import { decodeWorkerResult } from './protocol';
import { claimCompilerWorker } from './worker-slot';

const RUN_TIMEOUT_MS = 12_000;
const cancelled: RunResult = {
  ok: false, stdout: '', stderr: '', error: 'Execution cancelled.',
};

/** Both modes use disposable workers; abort terminates stale validation and output. */
function evaluateWorkspace(workspace: Workspace, mode: 'run' | 'check', signal?: AbortSignal): Promise<RunResult> {
  if (signal?.aborted) return Promise.resolve(cancelled);
  const problem = validateWorkspace(workspace);
  if (problem) {
    return Promise.resolve({ ok: false, stdout: '', stderr: '', error: problem });
  }
  return new Promise((resolve) => {
    let worker: Worker | undefined;
    let finished = false;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    let releaseSlot = () => {};
    const complete = (result: RunResult) => {
      if (finished) return;
      finished = true;
      if (timeout !== undefined) clearTimeout(timeout);
      signal?.removeEventListener('abort', onAbort);
      worker?.terminate();
      releaseSlot();
      resolve(result);
    };
    const onAbort = () => complete(cancelled);

    // Claim capacity BEFORE constructing WASM Worker. A new Run, Check or
    // Definition lookup cancels the previous one synchronously, so users
    // cannot accumulate expensive compiler Workers by rapid interaction.
    releaseSlot = claimCompilerWorker(onAbort);
    try {
      worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
    } catch {
      complete({
        ok: false, stdout: '', stderr: '',
        error: 'Unable to start the Scarp compiler worker in this browser.',
      });
      return;
    }
    const activeWorker = worker;
    const id = 1;
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
    activeWorker.onerror = (event) => {
      event.preventDefault();
      complete({
        ok: false,
        stdout: '',
        stderr: '',
        error: 'The compiler worker failed to load or crashed. See the browser console.',
      });
    };
    activeWorker.onmessage = (event: MessageEvent<RunResponse>) => {
      if (event.data?.id === id) complete(decodeWorkerResult(event.data.result));
    };
    activeWorker.onmessageerror = () => complete({
      ok: false, stdout: '', stderr: '',
      error: 'The compiler worker sent a message the browser could not decode.',
    });
    try {
      activeWorker.postMessage({ id, workspace, mode });
    } catch {
      complete({
        ok: false, stdout: '', stderr: '',
        error: 'Unable to send the source workspace to the compiler worker.',
      });
    }
  });
}

/** Execute real Scarp and return its captured stdout/stderr. */
export function runWorkspace(workspace: Workspace, signal?: AbortSignal): Promise<RunResult> {
  return evaluateWorkspace(workspace, 'run', signal);
}

/** Validate Scarp with identical budgets, without emitting program output. */
export function checkWorkspace(workspace: Workspace, signal?: AbortSignal): Promise<RunResult> {
  return evaluateWorkspace(workspace, 'check', signal);
}
