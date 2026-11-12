import { validPath, validateWorkspace, type Workspace } from './workspace';

/**
 * One ephemeral, in-memory undo token for an atomic multi-file editor change.
 * No browser persistence, network transfer, or compiler execution is involved.
 */
export type BulkEditUndo = {
  before: Workspace;
  after: Workspace;
  label: 'project-wide replacement' | 'symbol rename' | 'file move';
  restoreActiveFile?: string;
};

/** Reject partial graph changes and no-op operations before recording undo. */
export function createBulkEditUndo(
  before: Workspace,
  after: Workspace,
  label: BulkEditUndo['label'],
  moved?: { from: string; to: string },
): BulkEditUndo | null {
  if (before === after || validateWorkspace(before) || validateWorkspace(after)) return null;
  const oldPaths = Object.keys(before.files).sort();
  const newPaths = Object.keys(after.files).sort();
  if (oldPaths.length !== newPaths.length) return null;

  if (label === 'file move') {
    if (!moved || !validPath(moved.from) || !validPath(moved.to) ||
        moved.from === moved.to ||
        !Object.hasOwn(before.files, moved.from) ||
        Object.hasOwn(before.files, moved.to) ||
        Object.hasOwn(after.files, moved.from) ||
        !Object.hasOwn(after.files, moved.to) ||
        after.entry !== (before.entry === moved.from ? moved.to : before.entry)) return null;
    const expected = [...oldPaths.filter(path => path !== moved.from), moved.to].sort();
    if (expected.some((path, index) => path !== newPaths[index])) return null;
    return { before, after, label, restoreActiveFile: moved.from };
  }

  if (moved || before.entry !== after.entry ||
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
