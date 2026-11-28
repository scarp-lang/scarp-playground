import { validateWorkspace, validPath, type Workspace } from '../workspace';
import { claimCompilerWorker } from '../runner/worker-slot';
import { RUN_TIMEOUT_MS } from '../runner/limits';
import type { OutlineRequest, OutlineResponse } from '../runner/types';
import { locateOutline, validatedOutlineResult, type LocatedOutline } from './outline-protocol';

const failed = (error: string): LocatedOutline => ({ ok: false, error });

/** One disposable worker in the existing exclusive compiler slot. */
export function inspectSourceOutline(workspace: Workspace, path: string, signal?: AbortSignal): Promise<LocatedOutline> {
  if (signal?.aborted) return Promise.resolve(failed('Outline cancelled.'));
  const problem = validateWorkspace(workspace);
  if (problem) return Promise.resolve(failed(problem));
  if (!validPath(path) || !Object.hasOwn(workspace.files, path)) {
    return Promise.resolve(failed('Choose an existing source file.'));
  }
  const source = workspace.files[path];
  return new Promise(resolve => {
    let worker: Worker | undefined;
    let done = false;
    const timer: { deadline?: ReturnType<typeof setTimeout> } = {};
    let release = () => {};
    const complete = (result: LocatedOutline) => {
      if (done) return;
      done = true;
      if (timer.deadline !== undefined) clearTimeout(timer.deadline);
      signal?.removeEventListener('abort', onAbort);
      worker?.terminate();
      release();
      resolve(result);
    };
    const onAbort = () => complete(failed('Outline cancelled.'));
    release = claimCompilerWorker(onAbort);
    try {
      worker = new Worker(new URL('../runner/worker.ts', import.meta.url), { type: 'module' });
    } catch {
      complete(failed('Unable to start the Scarp outline worker.'));
      return;
    }
    signal?.addEventListener('abort', onAbort, { once: true });
    if (signal?.aborted) { onAbort(); return; }
    timer.deadline = setTimeout(() => complete(failed('Source outline exceeded the 12-second browser limit.')), RUN_TIMEOUT_MS);
    worker.onerror = event => { event.preventDefault(); complete(failed('The source outline worker failed to load or crashed.')); };
    worker.onmessageerror = () => complete(failed('The source outline worker sent an unreadable response.'));
    worker.onmessage = (event: MessageEvent<OutlineResponse>) => {
      if (event.data?.id === 1) complete(locateOutline(validatedOutlineResult(event.data.outline), path, source));
    };
    try {
      worker.postMessage({ id: 1, mode: 'outline', workspace, path } satisfies OutlineRequest);
    } catch { complete(failed('Unable to send source to the outline worker.')); }
  });
}
