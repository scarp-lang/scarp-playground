import { describe, expect, it } from 'vitest';
import { captureSourceCheckpoint, compareWorkspaceCheckpoint, previewCheckpointRestore } from '../src/source-checkpoint';
import { undoBulkEdit } from '../src/bulk-undo';
import type { Workspace } from '../src/workspace';

const initial = (): Workspace => ({ entry: 'src/main.srp', files: {
  'src/main.srp': 'print("नमस्ते");\r\n',
  'lib/math.srp': 'pub bind value = 21;\n',
  'empty.srp': '',
} });

describe('source-only checkpoints', () => {
  it('captures exact source, entry and active path without aliases', () => {
    const before = initial();
    const capture = captureSourceCheckpoint(before, 'lib/math.srp')!;
    expect(capture.workspace).toEqual(before);
    expect(capture.workspace).not.toBe(before);
    expect(capture.workspace.files).not.toBe(before.files);
    expect(capture.activeFile).toBe('lib/math.srp');
    before.files['src/main.srp'] = 'changed';
    expect(capture.workspace.files['src/main.srp']).toBe('print("नमस्ते");\r\n');
    expect(Object.isFrozen(capture.workspace.files)).toBe(true);
  });

  it('compares added, removed, modified and empty unchanged sources with exact bytes', () => {
    const before = initial();
    const checkpoint = captureSourceCheckpoint(before, before.entry)!;
    const current = { entry: 'new.srp', files: { 'new.srp': '', 'src/main.srp': 'print("😀");\n', 'empty.srp': '' } };
    const comparison = compareWorkspaceCheckpoint(checkpoint, current)!;
    expect(comparison.changed).toBe(3);
    expect(comparison.entryBefore).toBe('src/main.srp');
    expect(comparison.entryAfter).toBe('new.srp');
    expect(comparison.files).toEqual([
      { path: 'empty.srp', status: 'unchanged', beforeBytes: 0, afterBytes: 0 },
      { path: 'lib/math.srp', status: 'removed', beforeBytes: 21, afterBytes: 0 },
      { path: 'new.srp', status: 'added', beforeBytes: 0, afterBytes: 0 },
      { path: 'src/main.srp', status: 'modified', beforeBytes: new TextEncoder().encode(before.files['src/main.srp']).length, afterBytes: new TextEncoder().encode(current.files['src/main.srp']).length },
    ]);
  });

  it('restores complete detached source and entry and creates exact one-use undo', () => {
    const before = initial();
    const checkpoint = captureSourceCheckpoint(before, 'lib/math.srp')!;
    const current = { entry: 'new.srp', files: { 'new.srp': 'print(0);', 'scratch.srp': '' } };
    const plan = previewCheckpointRestore(current, 'scratch.srp', checkpoint)!;
    expect(plan.workspace).toEqual(before);
    expect(plan.workspace.files).not.toBe(checkpoint.workspace.files);
    expect(plan.activeFile).toBe('lib/math.srp');
    expect(plan.undo.restoreActiveFile).toBe('scratch.srp');
    expect(undoBulkEdit(plan.workspace, plan.undo)).toBe(current);
    expect(undoBulkEdit({ ...plan.workspace }, plan.undo)).toBeNull();
  });

  it('supports entry-only changes and rejects no-op or invalid workspaces', () => {
    const before = initial();
    const checkpoint = captureSourceCheckpoint(before, before.entry)!;
    expect(previewCheckpointRestore(before, before.entry, checkpoint)).toBeNull();
    const changed = { ...before, entry: 'empty.srp' };
    expect(compareWorkspaceCheckpoint(checkpoint, changed)?.changed).toBe(0);
    expect(previewCheckpointRestore(changed, 'empty.srp', checkpoint)?.workspace.entry).toBe(before.entry);
    expect(captureSourceCheckpoint(before, 'missing.srp')).toBeNull();
    expect(compareWorkspaceCheckpoint(checkpoint, { entry: 'missing.srp', files: {} })).toBeNull();
    expect(previewCheckpointRestore(changed, 'missing.srp', checkpoint)).toBeNull();
  });
});
