import { describe, expect, it } from 'vitest';
import {
  MAX_SCAFFOLD_REQUESTS, MAX_SCAFFOLD_PREVIEW_CHARS,
  previewBatchScaffold, verifiedScaffoldUndo,
  type ScaffoldRequest,
} from '../src/batch-scaffold';
import { MAX_FILES, MAX_FILE_BYTES, MAX_TOTAL_BYTES, type Workspace } from '../src/workspace';
import { undoBulkEdit } from '../src/bulk-undo';

function workspace(): Workspace {
  return { entry: 'main.srp', files: {
    'main.srp': 'import "lib/math.srp" as math;\nprint(math.answer);\n',
    'lib/math.srp': 'pub bind answer = 42;\n',
  } };
}
function preview(...requests: ScaffoldRequest[]) {
  const result = previewBatchScaffold(workspace(), requests);
  if (!result.ok) throw new Error(result.error);
  return result;
}
const empty = (path: string): ScaffoldRequest => ({ kind: 'empty', path });
const comment = (path: string): ScaffoldRequest => ({ kind: 'comment', path });
const custom = (path: string, content: string): ScaffoldRequest => ({
  path, kind: 'custom', content,
});
const clone = (path: string, from: string): ScaffoldRequest => ({
  path, kind: 'clone', from,
});

describe('batch scaffold input safety and defaults', () => {
  it('creates a new empty source with one editor line and no content bytes', () => {
    const result = preview(empty('lib/empty.srp'));
    expect(result.added).toEqual([{
      path: 'lib/empty.srp', kind: 'empty', bytes: 0, lines: 1,
      preview: '', previewTruncated: false, from: null, caution: null,
    }]);
    expect(result.workspace.files['lib/empty.srp']).toBe('');
  });

  it('creates an explicitly comment-only module without assuming syntax support', () => {
    const result = preview(comment('src/new_module.srp'));
    expect(result.workspace.files['src/new_module.srp']).toBe(
      '// Scarp module: src/new_module.srp\n',
    );
    expect(result.added[0].caution).toContain('Comment-only');
  });

  it('copies an existing source into a different path without modifying the original', () => {
    const result = preview(clone('src/math_copy.srp', 'lib/math.srp'));
    expect(result.workspace.files['src/math_copy.srp']).toBe(
      result.workspace.files['lib/math.srp'],
    );
    expect(result.added[0].from).toBe('lib/math.srp');
    expect(result.added[0].caution).toContain('relative imports');
  });

  it('warns that clone import paths may need rebasing', () => {
    const result = preview(clone('src/backup.srp', 'main.srp'));
    expect(result.added[0].caution).toContain('relative imports');
    expect(result.workspace.files['main.srp']).toContain('lib/math.srp');
  });

  it('preserves custom multiline source, CRLF and Unicode scalars exactly', () => {
    const content = '// हिंदी 😀\r\npub bind value = 42;\r\n';
    const result = preview(custom('src/unicode.srp', content));
    expect(result.workspace.files['src/unicode.srp']).toBe(content);
    expect(result.added[0].bytes).toBe(new TextEncoder().encode(content).byteLength);
    expect(result.added[0].lines).toBe(3);
  });

  it('supports mixed empty, comment, clone and custom files in one atomic preview', () => {
    const result = preview(
      empty('src/empty.srp'), comment('src/docs.srp'),
      clone('src/clone.srp', 'lib/math.srp'),
      custom('src/custom.srp', 'print("ready");\n'),
    );
    expect(result.added).toHaveLength(4);
    expect(result.remainingSlots).toBe(MAX_FILES - 6);
    expect(result.existingFiles).toBe(2);
    expect(result.workspace.entry).toBe('main.srp');
  });

  it('retains original source object and entrypoint without mutation', () => {
    const source = workspace(), prior = JSON.stringify(source);
    const result = previewBatchScaffold(source, [comment('new.srp')]);
    expect(result.ok).toBe(true);
    expect(JSON.stringify(source)).toBe(prior);
    expect(result.ok && result.workspace.entry).toBe(source.entry);
    expect(result.ok && result.workspace).not.toBe(source);
  });

  it('never exports source bytes, stdin, or output to a new data shape', () => {
    const result = preview(comment('docs.srp'));
    expect(Object.keys(result).sort()).toEqual([
      'added', 'existingFiles', 'ok', 'remainingSlots',
      'totalNewBytes', 'workspace',
    ]);
    expect(Object.keys(result.workspace).sort()).toEqual(['entry', 'files']);
    expect(JSON.stringify(result)).not.toContain('allowPrompts');
  });

  it('requires at least one request and enforces the four-file cap', () => {
    expect(previewBatchScaffold(workspace(), []).ok).toBe(false);
    const tooMany = Array.from({ length: MAX_SCAFFOLD_REQUESTS + 1 }, (_, i) =>
      empty('new' + i + '.srp'));
    expect(previewBatchScaffold(workspace(), tooMany).ok).toBe(false);
  });

  it('refuses to exceed the shared twelve-file workspace quota', () => {
    const source = workspace();
    for (let i = 0; i < MAX_FILES - 3; i++) source.files['extra' + i + '.srp'] = '';
    expect(Object.keys(source.files)).toHaveLength(MAX_FILES - 1);
    expect(previewBatchScaffold(source, [empty('last.srp')]).ok).toBe(true);
    expect(previewBatchScaffold(source, [
      empty('last.srp'), empty('too_many.srp'),
    ]).ok).toBe(false);
  });

  it('rejects existing names instead of silently overwriting source', () => {
    expect(previewBatchScaffold(workspace(), [empty('main.srp')]).ok).toBe(false);
    expect(previewBatchScaffold(workspace(), [clone('lib/math.srp', 'main.srp')]).ok).toBe(false);
  });

  it('rejects duplicate new names even when case differs', () => {
    expect(previewBatchScaffold(workspace(), [
      empty('New.srp'), empty('new.srp'),
    ]).ok).toBe(false);
  });

  it('rejects case-insensitive conflicts with existing filenames', () => {
    expect(previewBatchScaffold(workspace(), [empty('MAIN.srp')]).ok).toBe(false);
    expect(previewBatchScaffold(workspace(), [empty('lib/MATH.srp')]).ok).toBe(false);
  });

  it('rejects Windows reserved names and unsafe host-like paths', () => {
    for (const path of [
      'con.srp', 'COM1.srp', 'src/nul.srp', 'src/lpt9.srp',
      '../escape.srp', '/absolute.srp', './relative.srp', 'src\\x.srp',
      'src/../escape.srp', 'src/file.txt', 'src/.hidden.srp',
    ]) {
      expect(previewBatchScaffold(workspace(), [empty(path)]).ok).toBe(false);
    }
  });

  it('rejects invalid input workspaces before preparing any new source', () => {
    const cases = [
      null,
      { entry: 'missing.srp', files: { 'main.srp': '' } },
      { entry: 'main.srp', files: { 'main.srp': '\uD800' } },
      { entry: 'main.srp', files: { 'main.srp': 4 } },
    ];
    for (const value of cases) {
      expect(previewBatchScaffold(value as Workspace, [empty('next.srp')]).ok).toBe(false);
    }
  });

  it('rejects cloning from an absent or invalid source path', () => {
    expect(previewBatchScaffold(workspace(), [
      clone('new.srp', 'missing.srp'),
    ]).ok).toBe(false);
    expect(previewBatchScaffold(workspace(), [
      clone('new.srp', '../escape.srp'),
    ]).ok).toBe(false);
  });

  it('does not clone newly staged files as though they already existed', () => {
    expect(previewBatchScaffold(workspace(), [
      comment('new.srp'), clone('copy.srp', 'new.srp'),
    ]).ok).toBe(false);
  });

  it('rejects malformed custom content with unpaired UTF-16 surrogate', () => {
    expect(previewBatchScaffold(workspace(), [
      custom('new.srp', '😀\uD800'),
    ]).ok).toBe(false);
  });

  it('enforces the 64 KiB file size cap for custom generated source', () => {
    expect(previewBatchScaffold(workspace(), [
      custom('new.srp', 'x'.repeat(MAX_FILE_BYTES)),
    ]).ok).toBe(true);
    expect(previewBatchScaffold(workspace(), [
      custom('new.srp', 'x'.repeat(MAX_FILE_BYTES + 1)),
    ]).ok).toBe(false);
  });

  it('rejects a projected project that exceeds 128 KiB aggregate source bytes', () => {
    const input = workspace();
    input.files['main.srp'] = 'x'.repeat(MAX_FILE_BYTES);
    input.files['lib/math.srp'] = 'y'.repeat(MAX_FILE_BYTES - 2);
    expect(previewBatchScaffold(input, [custom('new.srp', 'hello')]).ok).toBe(false);
    expect(Object.keys(input.files)).toHaveLength(2);
  });

  it('does not allow malformed or unsupported template kinds', () => {
    expect(previewBatchScaffold(workspace(), [{
      path: 'new.srp', kind: 'unsupported' as ScaffoldRequest['kind'],
    }]).ok).toBe(false);
    expect(previewBatchScaffold(workspace(), [null as unknown as ScaffoldRequest]).ok)
      .toBe(false);
  });

  it('never modifies existing sources when a later batch item is invalid', () => {
    const original = workspace(), before = JSON.stringify(original);
    const result = previewBatchScaffold(original, [
      comment('valid.srp'), clone('invalid.srp', 'unknown.srp'),
    ]);
    expect(result.ok).toBe(false);
    expect(JSON.stringify(original)).toBe(before);
  });

  it('returns deterministic generated file lists in request order', () => {
    const result = preview(empty('z.srp'), empty('a.srp'));
    expect(result.added.map(item => item.path)).toEqual(['z.srp', 'a.srp']);
    expect(result.workspace.entry).toBe('main.srp');
  });

  it('clips long previews while retaining exact full source contents', () => {
    const content = '😀'.repeat(150) + 'print(42);';
    const result = preview(custom('new.srp', content));
    expect(result.workspace.files['new.srp']).toBe(content);
    expect(result.added[0].previewTruncated).toBe(true);
    expect(result.added[0].preview.length).toBeLessThanOrEqual(
      MAX_SCAFFOLD_PREVIEW_CHARS + 1,
    );
    expect(result.added[0].preview.endsWith('…')).toBe(true);
  });

  it('counts multiline source files including final empty editor lines', () => {
    const result = preview(custom('new.srp', 'a\r\nb\rc\n'));
    expect(result.added[0].lines).toBe(4);
  });

  it('reports the total number of new source bytes without counting old files', () => {
    const result = preview(comment('new.srp'), custom('custom.srp', 'नमस्ते'));
    const byteCount = result.added.reduce((sum, item) => sum + item.bytes, 0);
    expect(result.totalNewBytes).toBe(byteCount);
    expect(result.totalNewBytes).toBeGreaterThan(0);
  });
});

describe('scaffold plan proof and atomic undo', () => {
  it('creates a reversible add-only bulk undo when exact source text matches', () => {
    const before = workspace();
    const requests = [comment('lib/new.srp')];
    const result = previewBatchScaffold(before, requests);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const undo = verifiedScaffoldUndo(before, requests, result);
    expect(undo?.label).toBe('source import');
    expect(undoBulkEdit(result.workspace, undo)).toBe(before);
  });

  it('does not allow undo after another editor operation changes the workspace object', () => {
    const before = workspace(), requests = [empty('new.srp')];
    const result = previewBatchScaffold(before, requests);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const token = verifiedScaffoldUndo(before, requests, result);
    expect(token).not.toBeNull();
    expect(undoBulkEdit({ ...result.workspace }, token)).toBeNull();
  });

  it('rejects a forged plan that alters original source after generating a new file', () => {
    const before = workspace(), requests = [empty('new.srp')];
    const result = previewBatchScaffold(before, requests);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const forged = {
      ...result, workspace: {
        entry: before.entry, files: { ...result.workspace.files, 'main.srp': 'print(999);' },
      },
    };
    expect(verifiedScaffoldUndo(before, requests, forged)).toBeNull();
  });

  it('rejects a forged plan that changes the entrypoint', () => {
    const before = workspace(), requests = [empty('new.srp')];
    const result = previewBatchScaffold(before, requests);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(verifiedScaffoldUndo(before, requests, {
      ...result, workspace: { ...result.workspace, entry: 'new.srp' },
    })).toBeNull();
  });

  it('rejects an old plan when the original source has changed', () => {
    const before = workspace(), requests = [empty('new.srp')];
    const result = previewBatchScaffold(before, requests);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const changed = workspace();
    changed.files['main.srp'] = 'print("other source");';
    expect(verifiedScaffoldUndo(changed, requests, result)).toBeNull();
  });

  it('rejects proof when one request was changed after preview', () => {
    const before = workspace(), requests = [comment('new.srp')];
    const result = previewBatchScaffold(before, requests);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(verifiedScaffoldUndo(before, [empty('new.srp')], result)).toBeNull();
  });

  it('does not accept a forged invalid result as an undo token', () => {
    expect(verifiedScaffoldUndo(workspace(), [empty('new.srp')], {
      ok: false, error: 'stale',
    })).toBeNull();
  });

  it('does not depend on clone source references surviving a later edit', () => {
    const before = workspace(), requests = [clone('copy.srp', 'main.srp')];
    const result = previewBatchScaffold(before, requests);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    before.files['main.srp'] = 'print(42);';
    expect(verifiedScaffoldUndo(before, requests, result)).toBeNull();
  });

  it('accepts four portable new files within the existing quota', () => {
    const input = workspace(), requests = [
      empty('a.srp'), comment('b.srp'), clone('c.srp', 'main.srp'),
      custom('d.srp', 'print(5);'),
    ];
    const result = previewBatchScaffold(input, requests);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.added).toHaveLength(4);
    expect(verifiedScaffoldUndo(input, requests, result)).not.toBeNull();
  });
});
