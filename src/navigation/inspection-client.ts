import { validateWorkspace, type Workspace } from '../workspace';
import { claimCompilerWorker } from '../runner/worker-slot';
import { RUN_TIMEOUT_MS } from '../runner/limits';
import type { InspectionRequest, InspectionResponse } from '../runner/types';
import { locateInventory, validatedInspectionResult, type LocatedInspection } from './inspection-protocol';

const fail = (error: string): LocatedInspection => ({ ok: false, error });

export function inspectWorkspace(workspace: Workspace, signal?: AbortSignal): Promise<LocatedInspection> {
  if (signal?.aborted) return Promise.resolve(fail('Module inspection cancelled.'));
  const problem = validateWorkspace(workspace);
  if (problem) return Promise.resolve(fail(problem));
  return new Promise(resolve => {
    let worker: Worker | undefined;
    let finished = false;
    const timer: { deadline?: ReturnType<typeof setTimeout> } = {};
    let release = () => {};
    const complete = (result: LocatedInspection) => {
      if (finished) return;
      finished = true;
      if (timer.deadline !== undefined) clearTimeout(timer.deadline);
      signal?.removeEventListener('abort', abort);
      worker?.terminate();
      release();
      resolve(result);
    };
    const abort = () => complete(fail('Module inspection cancelled.'));
    release = claimCompilerWorker(abort);
    try { worker = new Worker(new URL('../runner/worker.ts', import.meta.url), { type: 'module' }); }
    catch { complete(fail('Unable to start the module inspection worker.')); return; }
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) { abort(); return; }
    timer.deadline = setTimeout(() => complete(fail('Module inspection exceeded the 12-second browser limit.')), RUN_TIMEOUT_MS);
    worker.onerror = event => { event.preventDefault(); complete(fail('Module inspection worker failed to load or crashed.')); };
    worker.onmessageerror = () => complete(fail('Module inspection worker sent an unreadable response.'));
    worker.onmessage = (event: MessageEvent<InspectionResponse>) => {
      if (event.data?.id === 1) complete(locateInventory(validatedInspectionResult(event.data.inspection), workspace));
    };
    try { worker.postMessage({ id: 1, mode: 'inspect', workspace } satisfies InspectionRequest); }
    catch { complete(fail('Unable to send sources to the module inspection worker.')); }
  });
}
