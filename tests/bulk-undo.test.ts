import { describe, expect, it } from 'vitest';
import { createBulkEditUndo, undoBulkEdit } from '../src/bulk-undo';
import { previewProjectReplace } from '../src/project-replace';

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
