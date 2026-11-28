import { describe, expect, it } from 'vitest';
import {
  MAX_IMPORT_REPAIR_CHOICES, inspectMissingImports, previewImportRepairs,
  createImportRepairUndo, type ImportRepairSelection,
} from '../src/import-repair';
import { importPaths, resolveVirtualImport } from '../src/module-move';
import { undoBulkEdit } from '../src/bulk-undo';
import type { Workspace } from '../src/workspace';

const baseline = (): Workspace => ({
  entry: 'main.srp',
  files: {
    'main.srp': 'import "missing/math.srp" as math;\n' +
      'import "lib/text.srp" as text;\nprint("ready");\n',
    'lib/math.srp': 'pub bind answer = 42;',
    'lib/text.srp': 'pub bind text = "Hello";',
  },
});
function inspection(workspace = baseline()) {
  const result = inspectMissingImports(workspace);
  if (!result.ok) throw Error(result.error);
  return result;
}
function selection(workspace = baseline(), target = 'lib/math.srp'): ImportRepairSelection[] {
  return [{ id: inspection(workspace).missing[0].id, target }];
}
function successful(workspace = baseline(), choices = selection(workspace)) {
  const result = previewImportRepairs(workspace, choices);
  if (!result.ok) throw Error(result.error);
  return result;
}

describe('bounded local missing import inspection', () => {
  it('finds a missing target and suggests existing filename candidates', () => {
    const result = inspection();
    expect(result.missing).toHaveLength(1);
    expect(result.missing[0]).toMatchObject({
      importer: 'main.srp', attemptedPath: 'missing/math.srp',
      specifier: 'missing/math.srp', line: 1,
    });
    expect(result.missing[0].suggestions[0]).toBe('lib/math.srp');
    expect(result.missing[0].suggestions).not.toContain('main.srp');
  });

  it('does not classify a resolving local import as missing', () => {
    const result = inspection();
    expect(result.missing.map(item => item.specifier)).not.toContain('lib/text.srp');
  });

  it('never proposes a missing target without explicit user selection', () => {
    const input = baseline();
    expect(previewImportRepairs(input, []).ok).toBe(false);
    expect(input.files['main.srp']).toContain('missing/math.srp');
  });

  it('sorts candidate targets by similarity and path without automatic selection', () => {
    const input: Workspace = { entry: 'main.srp', files: {
      'main.srp': 'import "old/math.srp" as math;',
      'src/math.srp': '',
      'lib/math.srp': '',
      'src/other.srp': '',
    } };
    const result = inspection(input);
    expect(result.missing[0].suggestions.slice(0, 2))
      .toEqual(['lib/math.srp', 'src/math.srp']);
  });

  it('handles no missing imports with an empty inventory', () => {
    const input = baseline();
    input.files['main.srp'] = 'import "lib/math.srp" as math;';
    const result = inspection(input);
    expect(result.missing).toEqual([]);
    expect(result.invalid).toBe(0);
  });

  it('reports lexically unsupported import spellings without rewriting them', () => {
    const input = baseline();
    input.files['main.srp'] = 'import "\\u{61}.srp" as x;';
    const result = inspection(input);
    expect(result.missing).toEqual([]);
    expect(result.invalid).toBe(1);
  });

  it('skips import-looking text inside comments and quoted strings', () => {
    const input = baseline();
    input.files['main.srp'] =
      '// import "missing/a.srp" as a;\n' +
      'bind fake = """import "missing/a.srp" as a;""";\n' +
      'import "missing/math.srp" as math;';
    const result = inspection(input);
    expect(result.missing).toHaveLength(1);
  });

  it('returns exact Monaco line and column for an indented import', () => {
    const input = baseline();
    input.files['main.srp'] = '// explanation\n    import "missing/math.srp" as math;';
    expect(inspection(input).missing[0]).toMatchObject({
      line: 2, column: 13,
    });
  });

  it('rejects malformed source import syntax instead of guessing a repair', () => {
    const input = baseline();
    input.files['main.srp'] = 'import "unfinished.srp as unfinished;';
    expect(inspectMissingImports(input).ok).toBe(false);
  });

  it('rejects invalid workspace data before collecting candidates', () => {
    for (const input of [
      { entry: 'main.srp', files: { 'main.srp': 3 } },
      { entry: 'missing.srp', files: { 'main.srp': '' } },
      null,
    ]) {
      expect(inspectMissingImports(input as Workspace).ok).toBe(false);
    }
  });

  it('displays two independent missing targets in a source document', () => {
    const input = baseline();
    input.files['main.srp'] = 'import "lost/a.srp" as a;\nimport "lost/b.srp" as b;';
    const result = inspection(input);
    expect(result.missing).toHaveLength(2);
    expect(result.missing[0].id).not.toEqual(result.missing[1].id);
  });
});

describe('explicit source import repair preview', () => {
  it('repairs one missing import while preserving every unrelated character', () => {
    const original = baseline();
    const before = JSON.stringify(original);
    const result = successful(original);
    expect(result.workspace.entry).toBe(original.entry);
    expect(result.workspace.files['main.srp']).toBe(
      'import "lib/math.srp" as math;\n' +
      'import "lib/text.srp" as text;\nprint("ready");\n',
    );
    expect(result.workspace.files['lib/math.srp']).toBe(original.files['lib/math.srp']);
    expect(result.workspace.files['lib/text.srp']).toBe(original.files['lib/text.srp']);
    expect(JSON.stringify(original)).toBe(before);
    expect(result.edits).toHaveLength(1);
    expect(result.remainingMissing).toBe(0);
  });

  it('preserves existing resolved import references and aliases', () => {
    const result = successful();
    expect(result.workspace.files['main.srp']).toContain('import "lib/text.srp" as text;');
    const paths = importPaths(result.workspace.files['main.srp'])!;
    expect(paths.map(path => resolveVirtualImport('main.srp', path.specifier)))
      .toEqual(['lib/math.srp', 'lib/text.srp']);
  });

  it('can repair a missing relative path in a nested importing module', () => {
    const input: Workspace = { entry: 'main.srp', files: {
      'main.srp': 'import "lib/service.srp" as service;',
      'lib/service.srp': 'import "missing/math.srp" as math;',
      'utils/math.srp': 'pub bind answer = 42;',
    } };
    const result = successful(input, selection(input, 'utils/math.srp'));
    expect(result.workspace.files['lib/service.srp']).toContain('../utils/math.srp');
  });

  it('generates a complete before/after line preview without writing source', () => {
    const result = successful();
    expect(result.lines).toEqual([{
      path: 'main.srp', line: 1, edits: 1,
      before: 'import "missing/math.srp" as math;',
      after: 'import "lib/math.srp" as math;',
    }]);
    expect(result.changedFiles).toEqual(['main.srp']);
    expect(result.edits[0]).toMatchObject({
      importer: 'main.srp',
      oldSpecifier: 'missing/math.srp', newSpecifier: 'lib/math.srp',
      target: 'lib/math.srp',
    });
  });

  it('supports many explicit repairs in different files atomically', () => {
    const input: Workspace = { entry: 'main.srp', files: {
      'main.srp': 'import "lost/a.srp" as a;\n',
      'lib/service.srp': 'import "lost/b.srp" as b;\n',
      'util/a.srp': '',
      'util/b.srp': '',
    } };
    const items = inspection(input).missing;
    const result = successful(input, [
      { id: items[0].id, target: 'util/b.srp' },
      { id: items[1].id, target: 'util/a.srp' },
    ]);
    expect(result.edits).toHaveLength(2);
    expect(result.changedFiles).toEqual(['lib/service.srp', 'main.srp']);
    expect(result.workspace.files['lib/service.srp']).toContain('../util/b.srp');
    expect(result.workspace.files['main.srp']).toContain('util/a.srp');
  });

  it('supports two repaired imports on one source line with precise edit counts', () => {
    const input: Workspace = { entry: 'main.srp', files: {
      'main.srp': 'import "missing/a.srp" as a; import "missing/b.srp" as b;',
      'lib/a.srp': '',
      'lib/b.srp': '',
    } };
    const missing = inspection(input).missing;
    const result = successful(input, [
      { id: missing[0].id, target: 'lib/a.srp' },
      { id: missing[1].id, target: 'lib/b.srp' },
    ]);
    expect(result.lines).toHaveLength(1);
    expect(result.lines[0].edits).toBe(2);
    expect(result.workspace.files['main.srp']).toContain('import "lib/b.srp" as b;');
  });

  it('preserves CRLF source line endings and Unicode source text', () => {
    const input = baseline();
    input.files['main.srp'] = '// हिंदी 😀\r\nimport "lost/math.srp" as math;\r\nprint("😀");\r\n';
    const result = successful(input, selection(input));
    expect(result.workspace.files['main.srp']).toBe(
      '// हिंदी 😀\r\nimport "lib/math.srp" as math;\r\nprint("😀");\r\n',
    );
  });

  it('permits a subset of repairs and reports missing sites left unresolved', () => {
    const input = baseline();
    input.files['main.srp'] =
      'import "lost/a.srp" as a;\nimport "lost/b.srp" as b;\n';
    const items = inspection(input).missing;
    const result = successful(input, [{ id: items[0].id, target: 'lib/math.srp' }]);
    expect(result.remainingMissing).toBe(1);
    expect(result.workspace.files['main.srp']).toContain('lost/b.srp');
  });

  it('never modifies a source file that has no selected import span', () => {
    const input = baseline();
    const result = successful(input);
    expect(result.workspace.files['lib/math.srp']).toBe(input.files['lib/math.srp']);
    expect(result.workspace.files['lib/text.srp']).toBe(input.files['lib/text.srp']);
  });

  it('refuses a forged ID or stale site after a source edit', () => {
    const input = baseline();
    expect(previewImportRepairs(input, [
      { id: 'unknown', target: 'lib/math.srp' },
    ]).ok).toBe(false);
    const old = selection(input);
    input.files['main.srp'] = '\n' + input.files['main.srp'];
    expect(previewImportRepairs(input, old).ok).toBe(false);
  });

  it('rejects duplicate selections and unsupported destination files', () => {
    const input = baseline();
    const valid = selection(input)[0];
    expect(previewImportRepairs(input, [valid, valid]).ok).toBe(false);
    expect(previewImportRepairs(input, [{ ...valid, target: 'missing.srp' }]).ok).toBe(false);
    expect(previewImportRepairs(input, [{ ...valid, target: '../secret.srp' }]).ok).toBe(false);
  });

  it('never repairs a missing import to the current importing file itself', () => {
    const input = baseline();
    const selected = selection(input);
    expect(previewImportRepairs(input, [{ ...selected[0], target: 'main.srp' }]).ok).toBe(false);
  });

  it('rejects a response with no selected choices or more than the hard cap', () => {
    const input = baseline();
    expect(previewImportRepairs(input, []).ok).toBe(false);
    const overflow = Array.from({ length: MAX_IMPORT_REPAIR_CHOICES + 1 },
      () => selection(input)[0]);
    expect(previewImportRepairs(input, overflow).ok).toBe(false);
  });

  it('refuses import edits that would push the workspace over its source budget', () => {
    const input: Workspace = { entry: 'main.srp', files: {
      'main.srp': 'import "x.srp" as x;\n' + 'x'.repeat(65_500),
      'lib/excessively_long_named_module.srp': '',
    } };
    const choices = selection(input, 'lib/excessively_long_named_module.srp');
    const result = previewImportRepairs(input, choices);
    expect(result.ok).toBe(false);
  });

  it('rejects invalid source files before any replacement can occur', () => {
    const input = baseline();
    input.files['main.srp'] = '\uD800';
    expect(previewImportRepairs(input, [{ id: 'missing', target: 'lib/math.srp' }]).ok).toBe(false);
  });

  it('creates a reverified one-step bulk undo for a correct preview', () => {
    const input = baseline();
    const result = successful(input);
    const undo = createImportRepairUndo(input, result);
    expect(undo?.label).toBe('import repair');
    expect(undoBulkEdit(result.workspace, undo)).toBe(input);
    expect(undoBulkEdit({ ...result.workspace }, undo)).toBeNull();
  });

  it('rejects a forged preview with different resulting source text', () => {
    const input = baseline();
    const result = successful(input);
    const forged = {
      ...result, workspace: { ...result.workspace,
        files: { ...result.workspace.files, 'main.srp': 'print("hijacked");' },
      },
    };
    expect(createImportRepairUndo(input, forged)).toBeNull();
  });

  it('cannot create an undo token from a different source snapshot', () => {
    const input = baseline();
    const result = successful(input);
    const changed = { entry: input.entry, files: { ...input.files,
      'main.srp': '// new edit\n' + input.files['main.srp'],
    } };
    expect(createImportRepairUndo(changed, result)).toBeNull();
  });

  it('does not change compiler stdin, prompt permissions or runtime results', () => {
    const input = baseline();
    const report = successful(input);
    expect(Object.keys(report.workspace).sort()).toEqual(['entry', 'files']);
    expect(JSON.stringify(report.workspace)).not.toContain('allowPrompts');
    expect(JSON.stringify(report.workspace)).not.toContain('stdin');
  });
});
