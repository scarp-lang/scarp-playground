import { describe, expect, it } from 'vitest';
import { previewModuleMove, resolveVirtualImport } from '../src/module-move';

const moduleProject = () => ({
  entry: 'main.srp',
  files: {
    'main.srp': 'import "lib/math.srp" as math;\nprint(math.twice(21));\n',
    'lib/math.srp': 'pub pure funcra twice(n: integer) -> integer { return n * 2; }\n',
  },
});

describe('import-aware virtual file rename', () => {
  it('updates only the actual import string when renaming a referenced module', () => {
    const before = moduleProject();
    const plan = previewModuleMove(before, 'lib/math.srp', 'lib/arithmetic.srp');
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.workspace.entry).toBe('main.srp');
    expect(plan.workspace.files['lib/arithmetic.srp']).toBe(before.files['lib/math.srp']);
    expect(Object.hasOwn(plan.workspace.files, 'lib/math.srp')).toBe(false);
    expect(plan.workspace.files['main.srp']).toContain('import "lib/arithmetic.srp" as math;');
    expect(plan.workspace.files['main.srp']).toContain('print(math.twice(21));');
    expect(plan.rewrittenImports).toBe(1);
    expect(plan.lines).toEqual([{
      path: 'main.srp', line: 1,
      before: 'import "lib/math.srp" as math;',
      after: 'import "lib/arithmetic.srp" as math;', imports: 1,
    }]);
    expect(before.files['main.srp']).toContain('lib/math.srp');
  });

  it('updates existing relative imports when moving an importing module', () => {
    const workspace = {
      entry: 'entry.srp',
      files: {
        'entry.srp': 'import "modules/consumer.srp" as consumer;\nprint(consumer.call());\n',
        'modules/consumer.srp':
          'import "../lib/math.srp" as math;\npub pure funcra call() -> integer { return math.twice(21); }\n',
        'lib/math.srp': moduleProject().files['lib/math.srp'],
      },
    };
    const plan = previewModuleMove(workspace, 'modules/consumer.srp', 'app/consumer.srp');
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.workspace.files['entry.srp']).toContain('import "app/consumer.srp" as consumer;');
    expect(plan.workspace.files['app/consumer.srp']).toContain('import "../lib/math.srp" as math;');
    expect(plan.changedFiles).toEqual(['entry.srp']);
    expect(plan.rewrittenImports).toBe(1);
  });

  it('rebases imports inside a moved entry file and moves the entry reference', () => {
    const original = {
      entry: 'lib/main.srp',
      files: {
        'lib/main.srp': 'import "math.srp" as math;\nprint(math.twice(21));',
        'lib/math.srp': moduleProject().files['lib/math.srp'],
      },
    };
    const plan = previewModuleMove(original, 'lib/main.srp', 'app/main.srp');
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.workspace.entry).toBe('app/main.srp');
    expect(plan.workspace.files['app/main.srp']).toContain('import "../lib/math.srp" as math;');
    expect(plan.lines).toHaveLength(1);
    expect(plan.lines[0].path).toBe('app/main.srp');
  });

  it('does not rewrite comments, unrelated strings or contextual import names', () => {
    const workspace = {
      entry: 'main.srp',
      files: {
        'main.srp': [
          '// import "lib/math.srp" as ignored;',
          'bind note = "import \\"lib/math.srp\\" as ignored;";',
          'bind import = "lib/math.srp";',
          'import "./lib/math.srp" as math; // actual import',
          'print(math.twice(21));',
        ].join('\r\n'),
        'lib/math.srp': moduleProject().files['lib/math.srp'],
      },
    };
    const plan = previewModuleMove(workspace, 'lib/math.srp', 'lib/new_math.srp');
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    const after = plan.workspace.files['main.srp'];
    expect(after).toContain('// import "lib/math.srp" as ignored;');
    expect(after).toContain('bind note = "import \\"lib/math.srp\\" as ignored;";');
    expect(after).toContain('bind import = "lib/math.srp";');
    expect(after).toContain('import "lib/new_math.srp" as math; // actual import');
    expect(after.split('\r\n')).toHaveLength(5);
    expect(plan.lines).toHaveLength(1);
    expect(plan.lines[0].line).toBe(4);
  });

  it('preserves blank files and succeeds without import rewrites', () => {
    const workspace = { entry: 'main.srp', files: {
      'main.srp': 'print("hello");\n', 'unused.srp': '',
    } };
    const plan = previewModuleMove(workspace, 'unused.srp', 'dir/renamed.srp');
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.rewrittenImports).toBe(0);
    expect(plan.lines).toEqual([]);
    expect(plan.workspace.files['dir/renamed.srp']).toBe('');
  });

  it('updates multiple imports on one line without disturbing Unicode text', () => {
    const source = 'import "math.srp" as a; import "./math.srp" as b; print("नमस्ते 😀");\r\n';
    const workspace = { entry: 'main.srp', files: { 'main.srp': source, 'math.srp': '' } };
    const plan = previewModuleMove(workspace, 'math.srp', 'lib/math.srp');
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.rewrittenImports).toBe(2);
    expect(plan.lines).toHaveLength(1);
    expect(plan.lines[0].imports).toBe(2);
    expect(plan.workspace.files['main.srp']).toBe(
      'import "lib/math.srp" as a; import "lib/math.srp" as b; print("नमस्ते 😀");\r\n',
    );
  });

  it('rejects duplicate, missing, unsafe and unchanged paths', () => {
    const source = moduleProject();
    for (const target of ['main.srp', 'lib/math.srp', '../other.srp',
      '/root.srp', 'lib/file.ts', 'x'.repeat(129) + '.srp']) {
      expect(previewModuleMove(source, 'lib/math.srp', target).ok).toBe(false);
    }
    expect(previewModuleMove(source, 'not_found.srp', 'new.srp').ok).toBe(false);
  });

  it('rejects ambiguous and escaped import strings instead of guessing', () => {
    const sample = moduleProject();
    sample.files['main.srp'] = 'import "lib/\\u{6D}ath.srp" as math;';
    expect(previewModuleMove(sample, 'lib/math.srp', 'other.srp').ok).toBe(false);
    sample.files['main.srp'] = 'import "lib/math.srp" as ;';
    expect(previewModuleMove(sample, 'lib/math.srp', 'other.srp').ok).toBe(false);
    sample.files['main.srp'] = 'import "lib/math.srp" as math;\n"unterminated';
    expect(previewModuleMove(sample, 'lib/math.srp', 'other.srp').ok).toBe(false);
  });

  it('enforces bounded rewrites and new source byte limits', () => {
    const sample = { entry: 'main.srp', files: {
      'main.srp': 'import "x.srp" as x;\n'.repeat(121), 'x.srp': '',
    } };
    const plan = previewModuleMove(sample, 'x.srp', 'new.srp');
    expect(plan.ok).toBe(false);
    if (!plan.ok) expect(plan.error).toMatch(/120/);
  });

  it('resolves compiler-style relative paths but rejects traversal and URLs', () => {
    expect(resolveVirtualImport('app/main.srp', '../lib/math.srp')).toBe('lib/math.srp');
    expect(resolveVirtualImport('app/main.srp', './math.srp')).toBe('app/math.srp');
    expect(resolveVirtualImport('app/main.srp', '../../secrets.srp')).toBeNull();
    expect(resolveVirtualImport('app/main.srp', 'https://example.srp')).toBeNull();
    expect(resolveVirtualImport('app/main.srp', 'a//x.srp')).toBeNull();
  });
});
