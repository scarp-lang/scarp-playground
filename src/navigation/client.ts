import { validPath, validateWorkspace, type Workspace } from '../workspace';
import type { DefinitionRequest, DefinitionResponse } from '../runner/types';
import { validatedDefinitionResult, type DefinitionResult } from './protocol';

const TIMEOUT_MS = 12_000;
const failed = (message: string): DefinitionResult => ({ ok: false, error: message });

/** Each lookup is isolated in a disposable Worker; no remote index/server. */
export function findDefinition(
  workspace: Workspace, path: string, offset: number, signal?: AbortSignal,
): Promise<DefinitionResult> {
  if (signal?.aborted) return Promise.resolve(failed('Navigation cancelled.'));
  const problem = validateWorkspace(workspace);
  if (problem) return Promise.resolve(failed(problem));
  if (!validPath(path) || !Object.hasOwn(workspace.files, path) ||
      !Number.isSafeInteger(offset) || offset < 0 ||
      offset > new TextEncoder().encode(workspace.files[path]).byteLength) {
    return Promise.resolve(failed('Invalid navigation source or position.'));
  }
  return new Promise((resolve) => {
    let worker: Worker;
    try {
      worker = new Worker(new URL('../runner/worker.ts', import.meta.url), { type: 'module' });
    } catch {
      resolve(failed('Unable to start the Scarp navigation worker in this browser.'));
      return;
    }
    let done = false;
    let deadline: ReturnType<typeof setTimeout> | undefined;
    const complete = (value: DefinitionResult) => {
      if (done) return;
      done = true;
      if (deadline !== undefined) clearTimeout(deadline);
      signal?.removeEventListener('abort', onAbort);
      worker.terminate();
      resolve(value);
    };
    const onAbort = () => complete(failed('Navigation cancelled.'));
    signal?.addEventListener('abort', onAbort, { once: true });
    if (signal?.aborted) {
      complete(failed('Navigation cancelled.'));
      return;
    }
    deadline = setTimeout(() =>
      complete(failed('Definition lookup exceeded the 12-second browser limit.')), TIMEOUT_MS);
    worker.onerror = (event) => {
      event.preventDefault();
      complete(failed('The Scarp navigation worker failed to load or crashed.'));
    };
    worker.onmessageerror = () => complete(failed('The navigation worker sent an unreadable message.'));
    worker.onmessage = (event: MessageEvent<DefinitionResponse>) => {
      if (event.data?.id === 1) complete(validatedDefinitionResult(event.data.definition));
    };
    try {
      worker.postMessage({ id: 1, workspace, mode: 'definition', path, offset } satisfies DefinitionRequest);
    } catch {
      complete(failed('Unable to send source to the Scarp navigation worker.'));
    }
  });
}
