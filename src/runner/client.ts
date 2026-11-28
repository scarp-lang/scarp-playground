import { validateWorkspace, type Workspace } from '../workspace';
import { measureUtf8 } from '../utf8';
import type { RunResponse, RunResult } from './types';
import { decodeWorkerResult, decodeSilentResult } from './protocol';
import { claimCompilerWorker } from './worker-slot';
import { MAX_PROGRAM_INPUT_BYTES, RUN_TIMEOUT_MS } from './limits';
export { MAX_PROGRAM_INPUT_BYTES } from './limits';

const cancelled: RunResult = {
  ok: false, stdout: '', stderr: '', error: 'Execution cancelled.',
};

/** Each mode uses a disposable Worker. Aborting prevents stale results or output. */
function evaluateWorkspace(
  workspace: Workspace, mode: 'run' | 'check' | 'verify',
  signal?: AbortSignal, stdin = '', allowPrompts = false,
): Promise<RunResult> {
  if (signal?.aborted) return Promise.resolve(cancelled);
  const problem = validateWorkspace(workspace);
  if (problem) {
    return Promise.resolve({ ok: false, stdout: '', stderr: '', error: problem });
  }
  const input = measureUtf8(stdin, MAX_PROGRAM_INPUT_BYTES);
  if (!input.ok) {
    return Promise.resolve({
      ok: false, stdout: '', stderr: '',
      error: input.reason === 'invalid-unicode' ? 'Program input contains invalid Unicode.' :
        'Program input exceeds the 16 KiB browser limit.',
    });
  }
  return new Promise((resolve) => {
    let worker: Worker | undefined;
    let finished = false;
    const timer: { handle?: ReturnType<typeof setTimeout> } = {};
    let releaseSlot = () => {};
    const complete = (result: RunResult) => {
      if (finished) return;
      finished = true;
      if (timer.handle !== undefined) clearTimeout(timer.handle);
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
    timer.handle = setTimeout(() => {
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
      if (event.data?.id === id) complete(mode === 'run'
        ? decodeWorkerResult(event.data.result) : decodeSilentResult(event.data.result));
    };
    activeWorker.onmessageerror = () => complete({
      ok: false, stdout: '', stderr: '',
      error: 'The compiler worker sent a message the browser could not decode.',
    });
    try {
      activeWorker.postMessage(mode === 'run'
        ? { id, workspace, mode, stdin, ...(allowPrompts ? { allowPrompts: true } : {}) }
        : { id, workspace, mode });
    } catch {
      complete({
        ok: false, stdout: '', stderr: '',
        error: 'Unable to send the source workspace to the compiler worker.',
      });
    }
  });
}

/** Execute real Scarp and return its captured stdout/stderr. */
export function runWorkspace(
  workspace: Workspace, signal?: AbortSignal, stdin = '', allowPrompts = false,
): Promise<RunResult> {
  return evaluateWorkspace(workspace, 'run', signal, stdin, allowPrompts);
}

/** Validate Scarp with identical budgets, without emitting program output. */
export function checkWorkspace(workspace: Workspace, signal?: AbortSignal): Promise<RunResult> {
  return evaluateWorkspace(workspace, 'check', signal);
}

/** Compile and resolve without evaluating program statements or requesting stdin. */
export function verifyWorkspace(workspace: Workspace, signal?: AbortSignal): Promise<RunResult> {
  return evaluateWorkspace(workspace, 'verify', signal);
}
