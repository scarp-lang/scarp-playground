import type { Workspace } from './workspace';

/** Where the current browser-only editor can be restored after navigation. */
export type SessionCheckpoint = {
  workspace: Workspace;
  stdin: string;
  // An imported JSON project or forgotten browser copy is not recoverable
  // automatically. Built-in examples and unchanged share URLs are.
  recoverable: boolean;
};

/** Compare content, not React object identity: undo can recreate identical maps. */
export function sameWorkspaceContents(first: Workspace, second: Workspace): boolean {
  if (first === second) return true;
  if (first.entry !== second.entry) return false;
  const paths = Object.keys(first.files);
  if (paths.length !== Object.keys(second.files).length) return false;
  return paths.every(path =>
    Object.hasOwn(second.files, path) && first.files[path] === second.files[path]);
}

/**
 * The caller never stores ephemeral stdin. Thus a locally saved source graph
 * can be safe to reload while a changed stdin buffer is still at risk.
 *
 * A pristine built-in or exact share-link source is recoverable without local
 * persistence; an imported file and a forgotten local copy are not.
 */
export function hasUnprotectedSessionWork(
  workspace: Workspace,
  stdin: string,
  savingLocally: boolean,
  savedWorkspace: Workspace | null,
  checkpoint: SessionCheckpoint,
): boolean {
  const recoverableSource = savingLocally
    ? savedWorkspace
    : checkpoint.recoverable ? checkpoint.workspace : null;
  return recoverableSource === null ||
    !sameWorkspaceContents(workspace, recoverableSource) ||
    stdin !== checkpoint.stdin;
}
