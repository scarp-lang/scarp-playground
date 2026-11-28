import { describe, expect, it } from 'vitest';
import { previewFolderMove, validFolderPath, workspaceFolders } from '../src/folder-move';
import { previewPathMoves, importPaths, resolveVirtualImport } from '../src/module-move';
import { createBulkEditUndo, undoBulkEdit } from '../src/bulk-undo';
import type { Workspace } from '../src/workspace';

function project(): Workspace {
  return { entry: 'app/main.srp', files: {
    'app/main.srp': 'import "./math.srp" as math;\r\nimport "../shared/answer.srp" as answer;\r\nprint(math.twice(answer.value));\r\n',
    'app/math.srp': 'import r"nested/scale.srp" as scale;\n// import "app/main.srp" as fake;\npub pure funcra twice(n: integer) -> integer { return scale.factor * n; }\n',
    'app/nested/scale.srp': 'pub bind factor = 2;\n',
    'shared/answer.srp': 'pub bind value = 21;\n',
    'check.srp': 'import """app/math.srp""" as math;\nprint(math.twice(21));\n',
    'application/spare.srp': 'bind note = """import "app/math.srp" as fake;""";\n',
  } };
}

describe('atomic source folder relocation', () => {
  it('lists virtual folders and rejects unsafe folder paths', () => {
    expect(workspaceFolders(project())).toEqual(['app', 'app/nested', 'application', 'shared']);
    expect(validFolderPath('src/lib')).toBe(true);
    for (const path of ['', '/', '../app', 'app.srp', 'app//nested', 'x'.repeat(124)]) {
      expect(validFolderPath(path)).toBe(false);
    }
  });

  it('preserves every import identity, internal spelling and unrelated text', () => {
    const original = project();
    const snapshot = JSON.stringify(original);
    const result = previewFolderMove(original, 'app', 'src/features');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.paths).toEqual([
      { from: 'app/main.srp', to: 'src/features/main.srp' },
      { from: 'app/math.srp', to: 'src/features/math.srp' },
      { from: 'app/nested/scale.srp', to: 'src/features/nested/scale.srp' },
    ]);
    expect(result.workspace.entry).toBe('src/features/main.srp');
    expect(result.workspace.files['src/features/main.srp']).toBe(original.files['app/main.srp'].replace('../shared/', '../../shared/'));
    expect(result.workspace.files['src/features/math.srp']).toBe(original.files['app/math.srp']);
    expect(result.workspace.files['check.srp']).toBe(original.files['check.srp'].replace('app/math.srp', 'src/features/math.srp'));
    expect(result.workspace.files['application/spare.srp']).toBe(original.files['application/spare.srp']);
    expect(result.rewrittenImports).toBe(2);
    expect(result.lines.map(line => [line.path, line.line, line.imports])).toEqual([
      ['src/features/main.srp', 2, 1], ['check.srp', 1, 1],
    ]);
    expect(JSON.stringify(original)).toBe(snapshot);
    const mapping = new Map(result.paths.map(path => [path.from, path.to]));
    for (const [path, source] of Object.entries(original.files)) {
      const next = mapping.get(path) ?? path;
      const oldTargets = importPaths(source)!.map(site => resolveVirtualImport(path, site.specifier));
      const newTargets = importPaths(result.workspace.files[next])!.map(site => resolveVirtualImport(next, site.specifier));
      expect(newTargets).toEqual(oldTargets.map(target => mapping.get(target!) ?? target));
    }
  });

  it('moves a nested subtree and rebases its inbound and outbound imports', () => {
    const original = project();
    original.files['app/nested/scale.srp'] = 'import "../../shared/answer.srp" as answer;\npub bind factor = 2;\n';
    const result = previewFolderMove(original, 'app/nested', 'core');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.workspace.entry).toBe('app/main.srp');
    expect(result.workspace.files['app/math.srp']).toContain('r"../core/scale.srp"');
    expect(result.workspace.files['core/scale.srp']).toContain('"../shared/answer.srp"');
    expect(result.paths).toHaveLength(1);
  });

  it('blocks occupied, overlapping, missing and invalid destinations', () => {
    for (const [from, to] of [
      ['app', 'app'], ['app', 'app/deeper'], ['app/nested', 'app'],
      ['app', 'shared'], ['app', 'application'], ['missing', 'new'],
      ['app', '../secret'], ['app', 'x'.repeat(120)],
    ]) expect(previewFolderMove(project(), from, to).ok).toBe(false);
  });

  it('fails closed on missing imports, escaped spellings, malformed strings and excessive rewrites', () => {
    for (const source of [
      'import "missing.srp" as missing;',
      'import "\\u{61}pp/math.srp" as math;',
      'bind note = """unfinished',
      'import "app/math.srp" as math;\n'.repeat(121),
    ]) {
      const before = project();
      before.files['check.srp'] = source;
      expect(previewFolderMove(before, 'app', 'src/features').ok).toBe(false);
      expect(before.files['check.srp']).toBe(source);
    }
  });

  it('rejects non-injective mappings independently of folder validation', () => {
    for (const mapping of [
      new Map<string, string>(),
      new Map([['missing.srp', 'new.srp']]),
      new Map([['app/main.srp', 'shared/answer.srp']]),
      new Map([['app/main.srp', 'new.srp'], ['app/math.srp', 'new.srp']]),
      new Map([['app/main.srp', '../escape.srp']]),
    ]) expect(previewPathMoves(project(), mapping).ok).toBe(false);
  });

  it('records an exact undo token and rejects forged or stale results', () => {
    const before = project();
    const result = previewFolderMove(before, 'app', 'src/features');
    if (!result.ok) throw new Error(result.error);
    const metadata = { from: 'app', to: 'src/features', activeFile: 'app/math.srp' };
    const token = createBulkEditUndo(before, result.workspace, 'folder move', undefined, undefined, undefined, metadata);
    expect(token?.restoreActiveFile).toBe('app/math.srp');
    expect(undoBulkEdit(result.workspace, token)).toBe(before);
    expect(undoBulkEdit({ ...result.workspace }, token)).toBeNull();
    const corrupt = { ...result.workspace, files: { ...result.workspace.files, 'check.srp': 'print(0);' } };
    expect(createBulkEditUndo(before, corrupt, 'folder move', undefined, undefined, undefined, metadata)).toBeNull();
    expect(createBulkEditUndo(before, result.workspace, 'folder move')).toBeNull();
  });
});
