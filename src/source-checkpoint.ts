import { validateWorkspace, type Workspace } from './workspace';
import { sameWorkspaceContents } from './session-safety';
import type { BulkEditUndo } from './bulk-undo';

export type SourceCheckpoint = {
  workspace: Workspace;
  activeFile: string;
};

export type FileComparison = {
  path: string;
  status: 'added' | 'removed' | 'modified' | 'unchanged';
  beforeBytes: number;
  afterBytes: number;
};

export type WorkspaceComparison = {
  files: FileComparison[];
  entryBefore: string;
  entryAfter: string;
  changed: number;
};

const encoder = new TextEncoder();
const bytes = (source: string | undefined) => source === undefined ? 0 : encoder.encode(source).byteLength;

/** Explicit, detached, source-only memory snapshot. No input or results. */
export function captureSourceCheckpoint(workspace: Workspace, activeFile: string): SourceCheckpoint | null {
  if (validateWorkspace(workspace) || !Object.hasOwn(workspace.files, activeFile)) return null;
  return Object.freeze({
    workspace: Object.freeze({ entry: workspace.entry, files: Object.freeze({ ...workspace.files }) }),
    activeFile,
  });
}

function validCheckpoint(snapshot: SourceCheckpoint): boolean {
  return !validateWorkspace(snapshot.workspace) && Object.hasOwn(snapshot.workspace.files, snapshot.activeFile);
}

export function compareWorkspaceCheckpoint(snapshot: SourceCheckpoint, current: Workspace): WorkspaceComparison | null {
  if (!validCheckpoint(snapshot) || validateWorkspace(current)) return null;
  const paths = [...new Set([...Object.keys(snapshot.workspace.files), ...Object.keys(current.files)])].sort();
  const files = paths.map((path): FileComparison => {
    const before = Object.hasOwn(snapshot.workspace.files, path) ? snapshot.workspace.files[path] : undefined;
    const after = Object.hasOwn(current.files, path) ? current.files[path] : undefined;
    return { path, status: before === undefined ? 'added' : after === undefined ? 'removed' :
      before === after ? 'unchanged' : 'modified', beforeBytes: bytes(before), afterBytes: bytes(after) };
  });
  return {
    files, entryBefore: snapshot.workspace.entry, entryAfter: current.entry,
    changed: files.filter(file => file.status !== 'unchanged').length,
  };
}

export type CheckpointRestorePlan = {
  workspace: Workspace;
  activeFile: string;
  undo: BulkEditUndo;
};

/** Plan a complete replacement and one exact, ephemeral reverse operation. */
export function previewCheckpointRestore(current: Workspace, activeFile: string,
  snapshot: SourceCheckpoint): CheckpointRestorePlan | null {
  if (validateWorkspace(current) || !Object.hasOwn(current.files, activeFile) ||
      !validCheckpoint(snapshot) || sameWorkspaceContents(current, snapshot.workspace)) return null;
  const next = { entry: snapshot.workspace.entry, files: { ...snapshot.workspace.files } };
  return {
    workspace: next, activeFile: snapshot.activeFile,
    undo: { before: current, after: next, label: 'checkpoint restore', restoreActiveFile: activeFile },
  };
}
