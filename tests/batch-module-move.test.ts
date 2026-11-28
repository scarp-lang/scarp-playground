import { describe, expect, it } from 'vitest';
import {
  MAX_BATCH_MOVE_FILES, MAX_BATCH_IMPORT_EDITS,
  previewBatchModuleMove, summarizeBatchModuleMove,
  prepareBatchMoveUndo, describeBatchModuleMove,
  type BatchMoveEntry,
} from '../src/batch-module-move';
import { resolveVirtualImport, importPaths } from '../src/module-move';
import { undoBulkEdit } from '../src/bulk-undo';
import type { Workspace } from '../src/workspace';

const workspace = (): Workspace => ({
  entry: 'main.srp',
  files: {
    'main.srp': 'import "lib/math.srp" as math;\nimport "lib/text.srp" as text;\nprint(math.answer);',
    'lib/math.srp': 'pub bind answer = 42;',
    'lib/text.srp': 'import "math.srp" as math;\npub bind label = "fast";',
    'readme.srp': 'print("ready");',
  },
});
const move = (rows: BatchMoveEntry[], input = workspace(), active = input.entry) =>
  previewBatchModuleMove(input, rows, active);
const success = (rows: BatchMoveEntry[], input = workspace(), active = input.entry) => {
  const result = move(rows, input, active);
  if (!result.ok) throw new Error(result.error);
  return result;
};

describe('atomic batch module path refactoring', () => {
  it('moves two files and rebases imports across their new directories', () => {
    const original = workspace();
    const plan = success([
      { from: 'main.srp', to: 'src/main.srp' },
      { from: 'lib/math.srp', to: 'utils/math.srp' },
    ], original);
    expect(plan.workspace.entry).toBe('src/main.srp');
    expect(plan.nextActiveFile).toBe('src/main.srp');
    expect(Object.keys(plan.workspace.files).sort()).toEqual([
      'lib/text.srp', 'readme.srp', 'src/main.srp', 'utils/math.srp',
    ]);
    expect(plan.workspace.files['src/main.srp']).toContain('../utils/math.srp');
    expect(plan.workspace.files['src/main.srp']).toContain('../lib/text.srp');
    expect(plan.workspace.files['lib/text.srp']).toContain('../utils/math.srp');
    expect(plan.workspace.files['utils/math.srp']).toBe(original.files['lib/math.srp']);
    expect(plan.moves).toHaveLength(2);
    expect(plan.verifiedReferences.length).toBe(3);
  });

  it('allows a simultaneous pairwise path swap without overwriting either module', () => {
    const original = workspace();
    const plan = success([
      { from: 'lib/math.srp', to: 'lib/text.srp' },
      { from: 'lib/text.srp', to: 'lib/math.srp' },
    ], original);
    expect(plan.workspace.files['lib/text.srp']).toBe('pub bind answer = 42;');
    expect(plan.workspace.files['lib/math.srp']).toContain('pub bind label');
    expect(plan.workspace.files['main.srp']).toContain('import "lib/text.srp" as math;');
    expect(plan.workspace.files['main.srp']).toContain('import "lib/math.srp" as text;');
    expect(plan.verifiedReferences.every(edge => resolveVirtualImport(
      edge.nextImporter, edge.specifierAfter,
    ) === edge.nextTarget)).toBe(true);
  });

  it('does not reorder a user source body while moving files', () => {
    const original = workspace();
    const before = JSON.stringify(original);
    const plan = success([{ from: 'lib/math.srp', to: 'other/math.srp' }], original);
    expect(plan.workspace.files['other/math.srp']).toBe(original.files['lib/math.srp']);
    expect(JSON.stringify(original)).toBe(before);
  });

  it('does not rewrite comments or strings that merely resemble import syntax', () => {
    const input: Workspace = {
      entry: 'main.srp',
      files: {
        'main.srp': '// import "math.srp" as fake;\n' +
          'bind sample = """import "math.srp" as fake;""";\n' +
          'import "math.srp" as math;',
        'math.srp': 'pub bind value = 1;',
      },
    };
    const result = success([{ from: 'math.srp', to: 'lib/math.srp' }], input);
    expect(result.workspace.files['main.srp']).toBe(
      '// import "math.srp" as fake;\n' +
      'bind sample = """import "math.srp" as fake;""";\n' +
      'import "lib/math.srp" as math;',
    );
    expect(result.rewrittenImports).toBe(1);
  });

  it('keeps unicode source text and CRLF line endings outside rewritten imports', () => {
    const input: Workspace = {
      entry: 'main.srp',
      files: {
        'main.srp': '// हिंदी 😀\r\nimport "math.srp" as m;\r\nprint("😀");\r\n',
        'math.srp': 'pub bind a = 1;\r\n',
      },
    };
    const plan = success([{ from: 'math.srp', to: 'lib/math.srp' }], input);
    expect(plan.workspace.files['main.srp']).toBe(
      '// हिंदी 😀\r\nimport "lib/math.srp" as m;\r\nprint("😀");\r\n',
    );
    expect(plan.workspace.files['lib/math.srp']).toBe(input.files['math.srp']);
  });

  it('leaves an unchanged active file selected after renaming another module', () => {
    const original = workspace();
    const result = success([{ from: 'lib/math.srp', to: 'utils/math.srp' }], original, 'readme.srp');
    expect(result.nextActiveFile).toBe('readme.srp');
    expect(result.workspace.entry).toBe('main.srp');
    expect(summarizeBatchModuleMove(original, result)).toMatchObject({
      moved: 1, entryChanged: false, activeFileChanged: false,
    });
  });

  it('updates a moved active source file without losing its entry status', () => {
    const original = workspace();
    const result = success([{ from: 'main.srp', to: 'src/main.srp' }], original);
    expect(summarizeBatchModuleMove(original, result)).toMatchObject({
      moved: 1, entryChanged: true, activeFileChanged: true,
    });
  });

  it('counts physically rewritten import literals and verified references separately', () => {
    const result = success([{ from: 'lib/math.srp', to: 'core/math.srp' }]);
    expect(result.rewrittenImports).toBe(2);
    expect(result.verifiedReferences).toHaveLength(3);
    expect(result.lines).toHaveLength(2);
    expect(result.changedFiles).toEqual(['core/math.srp', 'lib/text.srp', 'main.srp']);
    expect(describeBatchModuleMove(result)).toContain('3 local imports independently verified');
  });

  it('requires at least one actual file path move', () => {
    const original = workspace();
    expect(move([{ from: 'main.srp', to: 'main.srp' }], original).ok).toBe(false);
    expect(move([], original).ok).toBe(false);
  });

  it('rejects repeated origins even if one mapping is a no-op', () => {
    const result = move([
      { from: 'main.srp', to: 'main.srp' },
      { from: 'main.srp', to: 'other.srp' },
    ]);
    expect(result.ok).toBe(false);
  });

  it('rejects destination conflicts between moved files', () => {
    const result = move([
      { from: 'lib/math.srp', to: 'combined.srp' },
      { from: 'lib/text.srp', to: 'combined.srp' },
    ]);
    expect(result.ok).toBe(false);
  });

  it('refuses overwriting an existing unmoved file', () => {
    const result = move([{ from: 'lib/math.srp', to: 'readme.srp' }]);
    expect(result.ok).toBe(false);
  });

  it('does not reject an intentional three-way permutation', () => {
    const input = { entry: 'main.srp', files: {
      'main.srp': 'import "a.srp" as a;',
      'a.srp': 'import "b.srp" as b;',
      'b.srp': 'pub bind value = 1;',
    } };
    const result = success([
      { from: 'main.srp', to: 'a.srp' },
      { from: 'a.srp', to: 'b.srp' },
      { from: 'b.srp', to: 'main.srp' },
    ], input);
    expect(result.workspace.entry).toBe('a.srp');
    expect(result.workspace.files['main.srp']).toContain('value');
    expect(result.verifiedReferences).toHaveLength(2);
  });

  it('rejects invalid virtual paths, traversal, Windows drive and unsafe Unicode', () => {
    const destination = [
      '../escape.srp', '/absolute.srp', 'C:\\file.srp',
      'lib//math.srp', 'hello.txt', 'math.SRP', 'white space.srp',
      'x'.repeat(129) + '.srp', '🇮🇳.srp',
    ];
    for (const to of destination) {
      expect(move([{ from: 'lib/math.srp', to }]).ok).toBe(false);
    }
  });

  it('rejects nonexistent or malformed source origins', () => {
    expect(move([{ from: 'missing.srp', to: 'x.srp' }]).ok).toBe(false);
    expect(move([{ from: '../outside.srp', to: 'x.srp' }]).ok).toBe(false);
  });

  it('rejects a malformed source workspace before any import rewrite', () => {
    const input = { entry: 'main.srp', files: { 'main.srp': 7 } };
    expect(move([{ from: 'main.srp', to: 'new.srp' }], input as unknown as Workspace).ok).toBe(false);
  });

  it('refuses unresolved target imports instead of guessing rebases', () => {
    const input = {
      entry: 'main.srp',
      files: { 'main.srp': 'import "missing.srp" as missing;', 'other.srp': '' },
    };
    expect(move([{ from: 'other.srp', to: 'relocated.srp' }], input).ok).toBe(false);
  });

  it('rejects ambiguous escape spellings that cannot be verified as a local path', () => {
    const input = { entry: 'main.srp', files: {
      'main.srp': 'import "\\u{61}.srp" as a;',
      'a.srp': '',
    } };
    expect(move([{ from: 'a.srp', to: 'b.srp' }], input).ok).toBe(false);
  });

  it('rejects unterminated import literals and malformed source syntax', () => {
    const input = { entry: 'main.srp', files: {
      'main.srp': 'import "a.srp as a;',
      'a.srp': 'pub bind n = 1;',
    } };
    expect(move([{ from: 'a.srp', to: 'b.srp' }], input).ok).toBe(false);
  });

  it('bounds batch mapping rows at the compiler workspace limit', () => {
    const rows = Array.from({ length: MAX_BATCH_MOVE_FILES + 1 },
      (_, index) => ({ from: 'main.srp', to: 'target' + index + '.srp' }));
    expect(move(rows).ok).toBe(false);
  });

  it('can handle 120 imports without overflowing the preview quota', () => {
    const input = { entry: 'main.srp', files: {
      'main.srp': 'import "a.srp" as a;\n'.repeat(MAX_BATCH_IMPORT_EDITS),
      'a.srp': '',
    } };
    const result = move([{ from: 'a.srp', to: 'b.srp' }], input);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.rewrittenImports).toBe(MAX_BATCH_IMPORT_EDITS);
  });

  it('rejects more than 120 necessary import rewrites', () => {
    const input = { entry: 'main.srp', files: {
      'main.srp': 'import "a.srp" as a;\n'.repeat(MAX_BATCH_IMPORT_EDITS + 1),
      'a.srp': '',
    } };
    const result = move([{ from: 'a.srp', to: 'b.srp' }], input);
    expect(result.ok).toBe(false);
  });

  it('builds an exact one-step undo token only for a reverified preview', () => {
    const input = workspace();
    const result = success([{ from: 'lib/math.srp', to: 'core/math.srp' }], input, 'lib/math.srp');
    const token = prepareBatchMoveUndo(input, 'lib/math.srp', result)!;
    expect(token.label).toBe('batch module move');
    expect(token.restoreActiveFile).toBe('lib/math.srp');
    expect(undoBulkEdit(result.workspace, token)).toBe(input);
    expect(undoBulkEdit({ ...result.workspace }, token)).toBeNull();
  });

  it('rejects a tampered preview instead of recording an unsafe undo token', () => {
    const input = workspace();
    const result = success([{ from: 'lib/math.srp', to: 'core/math.srp' }], input);
    const forged = {
      ...result, workspace: { ...result.workspace, files: {
        ...result.workspace.files, 'main.srp': 'print("hijacked");',
      } },
    };
    expect(prepareBatchMoveUndo(input, 'main.srp', forged)).toBeNull();
  });

  it('rejects an undo built for an invalid active file or source snapshot', () => {
    const input = workspace();
    const result = success([{ from: 'main.srp', to: 'src/main.srp' }], input);
    expect(prepareBatchMoveUndo(input, 'missing.srp', result)).toBeNull();
  });

  it('does not reinterpret source contents as filesystem paths', () => {
    const input = workspace();
    const encoded = JSON.stringify(input);
    const result = move([{ from: 'lib/text.srp', to: 'nested/text.srp' }], input);
    expect(result.ok).toBe(true);
    expect(JSON.stringify(input)).toBe(encoded);
    const scanned = importPaths(input.files['main.srp']);
    expect(scanned).toHaveLength(2);
  });

  it('provides no forged success summary for an invalid preview', () => {
    const error = move([{ from: 'a.srp', to: 'b.srp' }]);
    expect(summarizeBatchModuleMove(workspace(), error)).toBeNull();
    expect(describeBatchModuleMove(error)).toMatch(/origin|existing/);
  });
});
