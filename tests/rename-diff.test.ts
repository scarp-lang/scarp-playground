import { describe, expect, it } from 'vitest';
import { buildRenameDiff } from '../src/navigation/rename-diff';
import { verifyRenameSnapshot, type RenameResult } from '../src/navigation/rename';
import type { Workspace } from '../src/workspace';

function preview(source: string, name: string, newName: string, path = 'main.srp'):
  { workspace: Workspace; result: Extract<RenameResult, { ok: true }> } {
  const encoder = new TextEncoder();
  const edits: Array<{ path: string; start: number; end: number }> = [];
  let position = 0;
  while (true) {
    const next = source.indexOf(name, position);
    if (next === -1) break;
    const start = encoder.encode(source.slice(0, next)).length;
    edits.push({ path, start, end: start + name.length });
    position = next + name.length;
  }
  return {
    workspace: { entry: path, files: { [path]: source } },
    result: {
      ok: true, old_name: name, new_name: newName, kind: 'binding',
      changes: edits.length, changed_files: [path],
      edits, files: { [path]: source.replaceAll(name, newName) },
    },
  };
}

describe('line-by-line compiler rename review', () => {
  it('shows all edited lines grouped by path, counting repeated edits on one line', () => {
    const original = 'bind item = 2;\nprint(item + item);\n';
    const { workspace, result } = preview(original, 'item', 'renamed');
    expect(verifyRenameSnapshot(workspace, 'renamed', result).ok).toBe(true);
    expect(buildRenameDiff(workspace, result)).toEqual({
      changedLines: 2,
      files: [{
        path: 'main.srp', lines: [
          { line: 1, sites: 1, before: 'bind item = 2;', after: 'bind renamed = 2;' },
          { line: 2, sites: 2, before: 'print(item + item);',
            after: 'print(renamed + renamed);' },
        ],
      }],
    });
  });

  it('preserves UTF-8 byte locations and CRLF line numbering after emoji', () => {
    const original = '// 😀\r\nbind item = 2;\r\nprint(item);\r\n';
    const { workspace, result } = preview(original, 'item', 'result', 'lib/main.srp');
    // The leading emoji occupies 4 UTF-8 bytes, but should not shift line IDs.
    expect(result.edits[0].start).toBe(new TextEncoder().encode('// 😀\r\nbind ').length);
    const diff = buildRenameDiff(workspace, result);
    expect(diff?.files[0].lines.map(line => line.line)).toEqual([2, 3]);
    expect(diff?.files[0].lines[0]).toEqual({
      line: 2, sites: 1, before: 'bind item = 2;', after: 'bind result = 2;',
    });
  });

  it('renders the entire edited source line without silently clipping long code', () => {
    const original = 'bind item = 2;\nprint(' + '1 + '.repeat(700) + 'item);\n';
    const { workspace, result } = preview(original, 'item', 'value');
    const line = buildRenameDiff(workspace, result)?.files[0].lines[1];
    expect(line?.before.length).toBeGreaterThan(2000);
    expect(line?.before.endsWith('item);')).toBe(true);
    expect(line?.after.endsWith('value);')).toBe(true);
  });

  it('handles 120 bounded replacements without losing any preview sites', () => {
    const original = 'bind item = 1;\nprint(' + Array(119).fill('item').join(' + ') + ');\n';
    const { workspace, result } = preview(original, 'item', 'updated');
    const diff = buildRenameDiff(workspace, result);
    expect(result.edits).toHaveLength(120);
    expect(diff?.changedLines).toBe(2);
    expect(diff?.files[0].lines.map(line => line.sites)).toEqual([1, 119]);
  });

  it('refuses a forged rename where edited source differs from the listed spans', () => {
    const { workspace, result } = preview('bind item = 1; print(item);', 'item', 'new_item');
    expect(buildRenameDiff(workspace, {
      ...result,
      files: { 'main.srp': 'bind new_item = 1; print(new_item); print("extra");' },
    })).toBeNull();
    expect(buildRenameDiff(workspace, {
      ...result, edits: [result.edits[0], result.edits[0]],
    })).toBeNull();
  });
});
