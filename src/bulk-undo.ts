import { validateWorkspace, type Workspace } from './workspace';

/**
 * One ephemeral, in-memory undo token for an atomic multi-file editor change.
 * No browser persistence, network transfer, or compiler execution is involved.
 */
export type BulkEditUndo = {
  before: Workspace;
  after: Workspace;
  label: 'project-wide replacement' | 'symbol rename';
};

/** Reject partial graph changes and no-op operations before recording undo. */
export function createBulkEditUndo(
  before: Workspace,
  after: Workspace,
  label: BulkEditUndo['label'],
): BulkEditUndo | null {
  if (before === after || before.entry !== after.entry ||
      validateWorkspace(before) || validateWorkspace(after)) return null;
  const oldPaths = Object.keys(before.files).sort();
  const newPaths = Object.keys(after.files).sort();
  if (oldPaths.length !== newPaths.length ||
      oldPaths.some((path, index) => path !== newPaths[index]) ||
      !oldPaths.some(path => before.files[path] !== after.files[path])) return null;
  return { before, after, label };
}

/** Only the *same untouched workspace snapshot* can be atomically restored. */
export function undoBulkEdit(current: Workspace, edit: BulkEditUndo | null): Workspace | null {
  if (!edit || current !== edit.after ||
      validateWorkspace(current) || validateWorkspace(edit.before)) return null;
  return edit.before;
}
