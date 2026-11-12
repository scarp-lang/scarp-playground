import { describe, expect, it } from 'vitest';
import { previewModuleDuplicate, suggestDuplicatePath } from '../src/module-duplicate';

const project = () => ({
  entry: 'main.srp',
  files: {
    'main.srp': 'import "lib/math.srp" as math;\nprint(math.twice(21));\n',
    'lib/math.srp': 'pub pure funcra twice(n: integer) -> integer { return n * 2; }\n',
  },
});

describe('import-aware virtual module duplication', () => {
  it('copies a module in the same directory without mutating original sources or entry', () => {
    const before = project();
    const result = previewModuleDuplicate(before, 'lib/math.srp', 'lib/math_copy.srp');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.workspace.entry).toBe(before.entry);
    expect(result.workspace.files['lib/math_copy.srp']).toBe(before.files['lib/math.srp']);
    expect(result.workspace.files['main.srp']).toBe(before.files['main.srp']);
    expect(result.workspace.files['lib/math.srp']).toBe(before.files['lib/math.srp']);
    expect(result.rewrittenImports).toBe(0);
    expect(result.lines).toEqual([]);
    expect(Object.keys(before.files)).toHaveLength(2);
  });

  it('rebases imported file paths when duplicating the entry module into another folder', () => {
    const before = project();
    const result = previewModuleDuplicate(before, 'main.srp', 'apps/main_copy.srp');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.workspace.entry).toBe('main.srp');
    expect(result.workspace.files['main.srp']).toBe(before.files['main.srp']);
    expect(result.workspace.files['apps/main_copy.srp']).toBe(
      'import "../lib/math.srp" as math;\nprint(math.twice(21));\n',
    );
    expect(result.rewrittenImports).toBe(1);
    expect(result.lines).toEqual([{
      line: 1, imports: 1,
      before: 'import "lib/math.srp" as math;',
      after: 'import "../lib/math.srp" as math;',
    }]);
  });

  it('preserves comments, ordinary strings, Unicode and CRLF exactly', () => {
    const source = [
      '// import "lib/math.srp" as ignored;',
      'bind description = "import \\"lib/math.srp\\" as ignored;";',
      'import "./lib/math.srp" as math;',
      'print("नमस्ते 😀");',
    ].join('\r\n') + '\r\n';
    const before = { entry: 'main.srp', files: {
      'main.srp': source,
      'lib/math.srp': project().files['lib/math.srp'],
    } };
    const result = previewModuleDuplicate(before, 'main.srp', 'app/copied.srp');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const duplicated = result.workspace.files['app/copied.srp'];
    expect(duplicated).toContain('// import "lib/math.srp" as ignored;');
    expect(duplicated).toContain('bind description = "import \\"lib/math.srp\\" as ignored;";');
    expect(duplicated).toContain('import "../lib/math.srp" as math;');
    expect(duplicated).toContain('print("नमस्ते 😀");\r\n');
    expect(duplicated.split('\r\n')).toHaveLength(5);
    expect(before.files['main.srp']).toBe(source);
    expect(result.lines).toHaveLength(1);
    expect(result.lines[0].line).toBe(3);
  });

  it('groups multiple import rewrites on one line and retains trailing LF', () => {
    const before = { entry: 'main.srp', files: {
      'main.srp': 'import "math.srp" as a; import "./math.srp" as b;\nprint(a.twice(5));\n',
      'math.srp': project().files['lib/math.srp'],
    } };
    const result = previewModuleDuplicate(before, 'main.srp', 'app/main_copy.srp');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.rewrittenImports).toBe(2);
    expect(result.lines).toHaveLength(1);
    expect(result.lines[0].imports).toBe(2);
    expect(result.workspace.files['app/main_copy.srp']).toBe(
      'import "../math.srp" as a; import "../math.srp" as b;\nprint(a.twice(5));\n',
    );
  });

  it('retains the original spelling of valid same-directory imports', () => {
    const before = { entry: 'main.srp', files: {
      'main.srp': 'import "./math.srp" as math;\nprint(math.twice(21));',
      'math.srp': project().files['lib/math.srp'],
    } };
    const result = previewModuleDuplicate(before, 'main.srp', 'main_copy.srp');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.workspace.files['main_copy.srp']).toContain('import "./math.srp" as math;');
    expect(result.rewrittenImports).toBe(0);
  });

  it('chooses collision-free sibling paths and rejects malformed or full projects', () => {
    const before = project();
    expect(suggestDuplicatePath(before, 'lib/math.srp')).toBe('lib/math_copy.srp');
    before.files['lib/math_copy.srp'] = '';
    expect(suggestDuplicatePath(before, 'lib/math.srp')).toBe('lib/math_copy2.srp');
    expect(previewModuleDuplicate(before, 'lib/math.srp', 'main.srp').ok).toBe(false);
    expect(previewModuleDuplicate(before, 'lib/math.srp', '../escape.srp').ok).toBe(false);
    expect(previewModuleDuplicate(before, 'missing.srp', 'new.srp').ok).toBe(false);
    const full: Record<string, string> = {};
    for (let i = 0; i < 12; i++) full['src' + i + '.srp'] = '';
    const workspace = { entry: 'src0.srp', files: full };
    expect(suggestDuplicatePath(workspace, 'src0.srp')).toBeNull();
    expect(previewModuleDuplicate(workspace, 'src0.srp', 'new.srp').ok).toBe(false);
  });

  it('fails closed on ambiguous, escaped or unresolved import sources', () => {
    const before = project();
    for (const source of [
      'import "lib/math.srp" as ;',
      'import "lib/math.srp" as math;\n"unfinished',
      'import "../secret.srp" as secret;',
      'import "missing.srp" as missing;',
      'import "lib/\\u{6D}ath.srp" as math;',
    ]) {
      before.files['main.srp'] = source;
      expect(previewModuleDuplicate(before, 'main.srp', 'app/main_copy.srp').ok).toBe(false);
    }
  });

  it('refuses copies that would exceed total UTF-8 byte limits', () => {
    const workspace = { entry: 'main.srp', files: {
      'main.srp': 'a'.repeat(50_000), 'other.srp': 'b'.repeat(50_000),
    } };
    const result = previewModuleDuplicate(workspace, 'main.srp', 'duplicate.srp');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/128 KiB/);
  });

  it('rejects more than 120 needed import rewrites without partial output', () => {
    const before = { entry: 'main.srp', files: {
      'main.srp': 'import "math.srp" as math;\n'.repeat(121),
      'math.srp': project().files['lib/math.srp'],
    } };
    const result = previewModuleDuplicate(before, 'main.srp', 'app/main_copy.srp');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/120/);
    expect(Object.keys(before.files)).toHaveLength(2);
  });
});
