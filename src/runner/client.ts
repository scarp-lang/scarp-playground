import { validateWorkspace, type Workspace } from '../workspace';
import { measureUtf8 } from '../utf8';
import type { RunResult } from './types';
import { decodeWorkerResult, decodeSilentResult } from './protocol';
import { invokeCompilerWorker, type WorkerSessionErrors } from './worker-session';
import { MAX_PROGRAM_INPUT_BYTES } from './limits';
export { MAX_PROGRAM_INPUT_BYTES } from './limits';

const failure = (error: string): RunResult => ({
  ok: false, stdout: '', stderr: '', error,
});

const messages: WorkerSessionErrors = {
  cancelled: 'Execution cancelled.',
  startup: 'Unable to start the Scarp compiler worker in this browser.',
  timeout: 'Execution exceeded the 12-second browser limit and was stopped.',
  crashed: 'The compiler worker failed to load or crashed. See the browser console.',
  unreadable: 'The compiler worker sent a message the browser could not decode.',
  send: 'Unable to send the source workspace to the compiler worker.',
};

/** Run, Check and Verify share the same one-shot worker lifecycle and budget. */
function evaluateWorkspace(
  workspace: Workspace, mode: 'run' | 'check' | 'verify',
  signal?: AbortSignal, stdin = '', allowPrompts = false,
): Promise<RunResult> {
  if (signal?.aborted) return Promise.resolve(failure(messages.cancelled));
  const problem = validateWorkspace(workspace);
  if (problem) return Promise.resolve(failure(problem));
  const input = measureUtf8(stdin, MAX_PROGRAM_INPUT_BYTES);
  if (!input.ok) {
    return Promise.resolve(failure(input.reason === 'invalid-unicode'
      ? 'Program input contains invalid Unicode.'
      : 'Program input exceeds the 16 KiB browser limit.'));
  }
  const request = mode === 'run'
    ? { id: 1, workspace, mode, stdin, ...(allowPrompts ? { allowPrompts: true } : {}) }
    : { id: 1, workspace, mode };
  return invokeCompilerWorker({
    request, signal, errors: messages, failure,
    decode: reply => mode === 'run'
      ? decodeWorkerResult(reply.result) : decodeSilentResult(reply.result),
  });
}

/** Execute real Scarp and return captured stdout/stderr. */
export function runWorkspace(
  workspace: Workspace, signal?: AbortSignal, stdin = '', allowPrompts = false,
): Promise<RunResult> {
  return evaluateWorkspace(workspace, 'run', signal, stdin, allowPrompts);
}

/** Validate Scarp with identical budgets, without program output. */
export function checkWorkspace(workspace: Workspace, signal?: AbortSignal): Promise<RunResult> {
  return evaluateWorkspace(workspace, 'check', signal);
}

/** Compile and resolve without evaluating statements or requesting stdin. */
export function verifyWorkspace(workspace: Workspace, signal?: AbortSignal): Promise<RunResult> {
  return evaluateWorkspace(workspace, 'verify', signal);
}
