import { validPath, validateWorkspace, type Workspace } from './workspace';

/**
 * One ephemeral, in-memory undo token for an atomic multi-file editor change.
 * No browser persistence, network transfer, or compiler execution is involved.
 */
export type BulkEditUndo = {
  before: Workspace;
  after: Workspace;
  label: 'project-wide replacement' | 'symbol rename' | 'file move' | 'file removal' | 'file duplication';
  restoreActiveFile?: string;
};

/** Reject partial graph changes and no-op operations before recording undo. */
export function createBulkEditUndo(
  before: Workspace,
  after: Workspace,
  label: BulkEditUndo['label'],
  moved?: { from: string; to: string },
  removed?: string,
  duplicated?: { from: string; to: string },
): BulkEditUndo | null {
  if (before === after || validateWorkspace(before) || validateWorkspace(after)) return null;
  const oldPaths = Object.keys(before.files).sort();
  const newPaths = Object.keys(after.files).sort();
  if (label === 'file duplication') {
    if (moved || removed || !duplicated ||
        !validPath(duplicated.from) || !validPath(duplicated.to) ||
        duplicated.from === duplicated.to ||
        !Object.hasOwn(before.files, duplicated.from) ||
        Object.hasOwn(before.files, duplicated.to) ||
        !Object.hasOwn(after.files, duplicated.to) ||
        before.entry !== after.entry ||
        newPaths.length !== oldPaths.length + 1 ||
        oldPaths.some(path => before.files[path] !== after.files[path]) ||
        [...oldPaths, duplicated.to].sort().some((path, index) => path !== newPaths[index]))
      return null;
    return { before, after, label, restoreActiveFile: duplicated.from };
  }

  if (label === 'file removal') {
    if (moved || duplicated || !removed || !validPath(removed) ||
        !Object.hasOwn(before.files, removed) ||
        Object.hasOwn(after.files, removed) ||
        oldPaths.length !== newPaths.length + 1 ||
        after.entry !== (before.entry === removed ? newPaths[0] : before.entry) ||
        newPaths.some((path, index) => path !==
          oldPaths.filter(original => original !== removed)[index]) ||
        newPaths.some(path => before.files[path] !== after.files[path])) return null;
    return { before, after, label, restoreActiveFile: removed };
  }

  if (removed || duplicated || oldPaths.length !== newPaths.length) return null;

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
