import { validPath, validateWorkspace, type Workspace } from '../workspace';
import { invokeCompilerWorker, type WorkerSessionErrors } from '../runner/worker-session';
import { validatedDefinitionResult, type DefinitionResult } from './protocol';

const failed = (error: string): DefinitionResult => ({ ok: false, error });
const messages: WorkerSessionErrors = {
  cancelled: 'Navigation cancelled.',
  startup: 'Unable to start the Scarp navigation worker in this browser.',
  timeout: 'Definition lookup exceeded the 12-second browser limit.',
  crashed: 'The Scarp navigation worker failed to load or crashed.',
  unreadable: 'The navigation worker sent an unreadable message.',
  send: 'Unable to send source to the Scarp navigation worker.',
};

/** Definition queries use the same disposable-worker slot as program execution. */
export function findDefinition(
  workspace: Workspace, path: string, offset: number, signal?: AbortSignal,
): Promise<DefinitionResult> {
  if (signal?.aborted) return Promise.resolve(failed(messages.cancelled));
  const problem = validateWorkspace(workspace);
  if (problem) return Promise.resolve(failed(problem));
  if (!validPath(path) || !Object.hasOwn(workspace.files, path) ||
      !Number.isSafeInteger(offset) || offset < 0 ||
      offset > new TextEncoder().encode(workspace.files[path]).byteLength) {
    return Promise.resolve(failed('Invalid navigation source or position.'));
  }
  return invokeCompilerWorker({
    request: { id: 1, workspace, mode: 'definition' as const, path, offset },
    signal, errors: messages, failure: failed,
    decode: reply => validatedDefinitionResult(reply.definition),
  });
}
