import { validateWorkspace, type Workspace } from '../workspace';
import { invokeCompilerWorker, type WorkerSessionErrors } from '../runner/worker-session';
import { locateInventory, validatedInspectionResult, type LocatedInspection } from './inspection-protocol';

const fail = (error: string): LocatedInspection => ({ ok: false, error });
const messages: WorkerSessionErrors = {
  cancelled: 'Module inspection cancelled.',
  startup: 'Unable to start the module inspection worker.',
  timeout: 'Module inspection exceeded the 12-second browser limit.',
  crashed: 'Module inspection worker failed to load or crashed.',
  unreadable: 'Module inspection worker sent an unreadable response.',
  send: 'Unable to send sources to the module inspection worker.',
};

export function inspectWorkspace(workspace: Workspace, signal?: AbortSignal): Promise<LocatedInspection> {
  if (signal?.aborted) return Promise.resolve(fail(messages.cancelled));
  const problem = validateWorkspace(workspace);
  if (problem) return Promise.resolve(fail(problem));
  return invokeCompilerWorker({
    request: { id: 1, mode: 'inspect' as const, workspace },
    signal, errors: messages, failure: fail,
    decode: reply => locateInventory(validatedInspectionResult(reply.inspection), workspace),
  });
}
