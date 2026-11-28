import { validateWorkspace, validPath, type Workspace } from '../workspace';
import { invokeCompilerWorker, type WorkerSessionErrors } from '../runner/worker-session';
import { locateOutline, validatedOutlineResult, type LocatedOutline } from './outline-protocol';

const failed = (error: string): LocatedOutline => ({ ok: false, error });
const messages: WorkerSessionErrors = {
  cancelled: 'Outline cancelled.',
  startup: 'Unable to start the Scarp outline worker.',
  timeout: 'Source outline exceeded the 12-second browser limit.',
  crashed: 'The source outline worker failed to load or crashed.',
  unreadable: 'The source outline worker sent an unreadable response.',
  send: 'Unable to send source to the outline worker.',
};

/** Source outline runs in an isolated Worker and is located against the input source. */
export function inspectSourceOutline(
  workspace: Workspace, path: string, signal?: AbortSignal,
): Promise<LocatedOutline> {
  if (signal?.aborted) return Promise.resolve(failed(messages.cancelled));
  const problem = validateWorkspace(workspace);
  if (problem) return Promise.resolve(failed(problem));
  if (!validPath(path) || !Object.hasOwn(workspace.files, path)) {
    return Promise.resolve(failed('Choose an existing source file.'));
  }
  const source = workspace.files[path];
  return invokeCompilerWorker({
    request: { id: 1, mode: 'outline' as const, workspace, path },
    signal, errors: messages, failure: failed,
    decode: reply => locateOutline(validatedOutlineResult(reply.outline), path, source),
  });
}
