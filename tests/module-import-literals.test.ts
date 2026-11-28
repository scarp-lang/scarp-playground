import { describe, expect, it } from 'vitest';
import { importPaths, previewModuleMove } from '../src/module-move';
import { previewModuleDuplicate } from '../src/module-duplicate';
import { previewModuleRemoval } from '../src/module-remove';
import type { Workspace } from '../src/workspace';

const moduleSource = 'pub pure funcra answer() -> integer { return 42; }\n';
const literal = (kind: 'ordinary' | 'raw' | 'multiline', value: string): string =>
  kind === 'raw' ? 'r"' + value + '"' : kind === 'multiline' ? '"""' + value + '"""' : '"' + value + '"';

function workspace(source: string): Workspace {
  return { entry: 'main.srp', files: { 'main.srp': source, 'lib.srp': moduleSource, 'spare.srp': '' } };
}

describe('alpha.3 import literal syntax across file operations', () => {
  for (const kind of ['ordinary', 'raw', 'multiline'] as const) {
    const original = 'import ' + literal(kind, './lib.srp') + ' as lib;\r\nprint(lib.answer());\r\n';
    it('locates the exact interior of ' + kind + ' imports', () => {
      const sites = importPaths(original);
      expect(sites).toHaveLength(1);
      expect(sites?.[0].specifier).toBe('./lib.srp');
      expect(original.slice(sites![0].start, sites![0].end)).toBe('./lib.srp');
    });
    it('preserves ' + kind + ' delimiters during rename and duplication', () => {
      const before = workspace(original);
      const moved = previewModuleMove(before, 'lib.srp', 'pkg/lib.srp');
      expect(moved.ok).toBe(true);
      if (!moved.ok) return;
      expect(moved.workspace.files['main.srp']).toBe(original.replace('./lib.srp', 'pkg/lib.srp'));
      expect(moved.rewrittenImports).toBe(1);
      const copy = previewModuleDuplicate(before, 'main.srp', 'pkg/main.srp');
      expect(copy.ok).toBe(true);
      if (!copy.ok) return;
      expect(copy.workspace.files['pkg/main.srp']).toBe(original.replace('./lib.srp', '../lib.srp'));
      expect(copy.workspace.files['main.srp']).toBe(original);
      expect(before.files['main.srp']).toBe(original);
    });
    it('blocks removal of a ' + kind + ' import target', () => {
      const result = previewModuleRemoval(workspace(original), 'lib.srp');
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.dependents).toEqual([{ importer: 'main.srp', line: 1, specifier: './lib.srp' }]);
    });
  }

  it('ignores import-shaped text, braces, comments and raw trailing backslashes', () => {
    const text = [
      'bind note = """',
      'import "lib.srp" as pretend;',
      'unbalanced } { // not syntax',
      '""";',
      'bind raw = r"literal\\\\";',
      'import r"lib.srp" as lib;',
      'print(lib.answer());',
    ].join('\r\n');
    const sites = importPaths(text);
    expect(sites?.map(site => site.specifier)).toEqual(['lib.srp']);
    const moved = previewModuleMove(workspace(text), 'lib.srp', 'pkg/lib.srp');
    expect(moved.ok).toBe(true);
    if (!moved.ok) return;
    expect(moved.workspace.files['main.srp']).toBe(text.replace('import r"lib.srp"', 'import r"pkg/lib.srp"'));
    expect(moved.lines[0].line).toBe(6);
    expect(moved.rewrittenImports).toBe(1);
  });

  it('does not consider an identifier ending in r a raw-string prefix', () => {
    const source = 'bind marker = "quoted"; // raw\nimport "lib.srp" as lib;';
    expect(importPaths(source)?.map(site => site.specifier)).toEqual(['lib.srp']);
  });

  it('fails closed for unterminated raw, multiline, or ordinary literals', () => {
    for (const broken of ['r"unfinished\n', '"""unfinished', '"unfinished\n"', '"escaped\\\n"']) {
      const before = workspace('bind note = ' + broken + ';\nimport "lib.srp" as lib;');
      expect(importPaths(before.files['main.srp'])).toBeNull();
      expect(previewModuleMove(before, 'lib.srp', 'pkg/lib.srp').ok).toBe(false);
      expect(previewModuleDuplicate(before, 'main.srp', 'pkg/main.srp').ok).toBe(false);
      expect(previewModuleRemoval(before, 'spare.srp').ok).toBe(false);
    }
  });

  it('refuses escaped, traversal and multiline-newline import paths', () => {
    for (const path of ['"\\u{6C}ib.srp"', 'r"../lib.srp"', '"""lib\n.srp"""']) {
      const before = workspace('import ' + path + ' as lib;');
      expect(previewModuleMove(before, 'lib.srp', 'pkg/lib.srp').ok).toBe(false);
      expect(previewModuleDuplicate(before, 'main.srp', 'pkg/main.srp').ok).toBe(false);
      expect(previewModuleRemoval(before, 'spare.srp').ok).toBe(false);
    }
  });
});
