import { describe, expect, it } from 'vitest';
import { createBulkEditUndo, undoBulkEdit } from '../src/bulk-undo';
import { previewProjectReplace } from '../src/project-replace';
import { previewModuleMove } from '../src/module-move';
import { previewModuleRemoval } from '../src/module-remove';
import { previewModuleDuplicate } from '../src/module-duplicate';

const base = () => ({ entry: 'main.srp', files: {
  'main.srp': 'print("twice");',
  'lib/math.srp': 'pub pure funcra twice(x: integer) -> integer { return x * 2; }',
} });

describe('ephemeral atomic multi-file undo', () => {
  it('restores the exact original source graph after a complete multi-file edit', () => {
    const before = base();
    const plan = previewProjectReplace(before, 'twice', 'double');
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    const ticket = createBulkEditUndo(before, plan.workspace, 'project-wide replacement');
    expect(ticket?.label).toBe('project-wide replacement');
    expect(undoBulkEdit(plan.workspace, ticket)).toBe(before);
    expect(before.files['main.srp']).toContain('twice');
    expect(before.files['lib/math.srp']).toContain('twice');
  });

  it('refuses to discard an intervening editor change or switched project', () => {
    const before = base();
    const after = { entry: before.entry, files: { ...before.files, 'main.srp': 'print("double");' } };
    const ticket = createBulkEditUndo(before, after, 'symbol rename');
    expect(ticket).not.toBeNull();
    expect(undoBulkEdit({ ...after, files: { ...after.files } }, ticket)).toBeNull();
    expect(undoBulkEdit(before, ticket)).toBeNull();
    expect(undoBulkEdit({ entry: 'main.srp', files: { 'main.srp': 'different' } }, ticket)).toBeNull();
    expect(undoBulkEdit(after, null)).toBeNull();
  });

  it('rejects no-op, changed entry, added files or an invalid original', () => {
    const before = base();
    expect(createBulkEditUndo(before, before, 'symbol rename')).toBeNull();
    expect(createBulkEditUndo(before, { ...before, files: { ...before.files } },
      'symbol rename')).toBeNull();
    expect(createBulkEditUndo(before, { ...before, entry: 'lib/math.srp' },
      'project-wide replacement')).toBeNull();
    expect(createBulkEditUndo(before, { ...before, files: { ...before.files, 'new.srp': '' } },
      'symbol rename')).toBeNull();
    const invalid = { entry: 'main.srp', files: {
      'main.srp': 'hello', '../escape.srp': 'sensitive',
    } };
    expect(createBulkEditUndo(invalid, before, 'symbol rename')).toBeNull();
  });

  it('accepts only valid UTF-8 file and project budgets', () => {
    const before = base();
    const after = { ...before, files: { ...before.files, 'main.srp': 'x'.repeat(70_000) } };
    expect(createBulkEditUndo(before, after, 'symbol rename')).toBeNull();
    const edit = createBulkEditUndo(before, { ...before, files: {
      ...before.files, 'main.srp': 'print("double");',
    } }, 'symbol rename');
    expect(edit).not.toBeNull();
    if (!edit) return;
    expect(undoBulkEdit(edit.after, edit)).toBe(before);
  });
});


describe('atomic file move undo', () => {
  it('restores original paths, entrypoint and imports from a validated snapshot', () => {
    const before = {
      entry: 'main.srp',
      files: {
        'main.srp': 'import "math.srp" as math;\nprint(math.twice(21));',
        'math.srp': 'pub pure funcra twice(n: integer) -> integer { return n * 2; }',
      },
    };
    const plan = previewModuleMove(before, 'main.srp', 'app/main.srp');
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    const ticket = createBulkEditUndo(before, plan.workspace, 'file move',
      { from: 'main.srp', to: 'app/main.srp' });
    expect(ticket?.restoreActiveFile).toBe('main.srp');
    expect(ticket?.label).toBe('file move');
    expect(undoBulkEdit(plan.workspace, ticket)).toBe(before);
    expect(undoBulkEdit({ ...plan.workspace }, ticket)).toBeNull();
  });

  it('rejects unverified path changes and refuses an invalidated snapshot', () => {
    const before = {
      entry: 'main.srp',
      files: { 'main.srp': 'print(1);', 'math.srp': 'pub bind factor = 2;' },
    };
    const after = { entry: 'renamed.srp', files: {
      'renamed.srp': 'print(1);', 'math.srp': 'pub bind factor = 2;',
    } };
    expect(createBulkEditUndo(before, after, 'file move')).toBeNull();
    expect(createBulkEditUndo(before, after, 'file move',
      { from: 'math.srp', to: 'renamed.srp' })).toBeNull();
    expect(createBulkEditUndo(before, after, 'file move',
      { from: 'main.srp', to: 'math.srp' })).toBeNull();
    const ticket = createBulkEditUndo(before, after, 'file move',
      { from: 'main.srp', to: 'renamed.srp' });
    expect(ticket).not.toBeNull();
    expect(undoBulkEdit(after, ticket)).toBe(before);
    expect(undoBulkEdit({ entry: 'renamed.srp', files: {
      ...after.files, 'math.srp': 'changed',
    } }, ticket)).toBeNull();
  });
});


describe('atomic module deletion undo', () => {
  it('restores the deleted file and former project entry on the same snapshot', () => {
    const original = { entry: 'main.srp', files: {
      'main.srp': 'print("hello");', 'unused.srp': '// untouched',
    } };
    const plan = previewModuleRemoval(original, 'main.srp');
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    const ticket = createBulkEditUndo(original, plan.workspace, 'file removal',
      undefined, 'main.srp');
    expect(ticket?.restoreActiveFile).toBe('main.srp');
    expect(undoBulkEdit(plan.workspace, ticket)).toBe(original);
    expect(undoBulkEdit({ ...plan.workspace }, ticket)).toBeNull();
  });

  it('refuses unsafe deletion tickets with modified surviving sources', () => {
    const before = { entry: 'main.srp', files: {
      'main.srp': 'print(1);', 'unused.srp': '// unused',
    } };
    const correct = { entry: 'main.srp', files: { 'main.srp': 'print(1);' } };
    expect(createBulkEditUndo(before, correct, 'file removal')).toBeNull();
    expect(createBulkEditUndo(before, correct, 'file removal',
      undefined, 'missing.srp')).toBeNull();
    expect(createBulkEditUndo(before, { entry: 'main.srp', files: {
      'main.srp': 'print(999);',
    } }, 'file removal', undefined, 'unused.srp')).toBeNull();
    const ticket = createBulkEditUndo(before, correct, 'file removal', undefined, 'unused.srp');
    expect(ticket).not.toBeNull();
    expect(undoBulkEdit(correct, ticket)).toBe(before);
  });
});


describe('atomic file duplication undo', () => {
  it('restores the original graph and entry after copying an imported Scarp module', () => {
    const before = {
      entry: 'main.srp', files: {
        'main.srp': 'import "math.srp" as math;\nprint(math.twice(21));',
        'math.srp': 'pub pure funcra twice(n: integer) -> integer { return n * 2; }',
      },
    };
    const plan = previewModuleDuplicate(before, 'main.srp', 'app/main_copy.srp');
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    const token = createBulkEditUndo(before, plan.workspace, 'file duplication',
      undefined, undefined, { from: 'main.srp', to: 'app/main_copy.srp' });
    expect(token?.label).toBe('file duplication');
    expect(token?.restoreActiveFile).toBe('main.srp');
    expect(undoBulkEdit(plan.workspace, token)).toBe(before);
    expect(undoBulkEdit({ ...plan.workspace }, token)).toBeNull();
  });

  it('refuses wrong added path, changed entry or modified surviving original', () => {
    const before = { entry: 'main.srp', files: {
      'main.srp': 'print(1);', 'math.srp': 'pub bind factor = 2;',
    } };
    const after = { entry: 'main.srp', files: {
      ...before.files, 'main_copy.srp': 'print(1);',
    } };
    expect(createBulkEditUndo(before, after, 'file duplication')).toBeNull();
    expect(createBulkEditUndo(before, after, 'file duplication', undefined, undefined,
      { from: 'math.srp', to: 'main.srp' })).toBeNull();
    expect(createBulkEditUndo(before, { ...after, entry: 'main_copy.srp' },
      'file duplication', undefined, undefined,
      { from: 'main.srp', to: 'main_copy.srp' })).toBeNull();
    expect(createBulkEditUndo(before, { ...after, files: {
      ...after.files, 'math.srp': 'overwritten',
    } }, 'file duplication', undefined, undefined,
    { from: 'main.srp', to: 'main_copy.srp' })).toBeNull();
    expect(createBulkEditUndo(before, after, 'file duplication', undefined, undefined,
      { from: 'main.srp', to: 'main_copy.srp' })).not.toBeNull();
  });
});
