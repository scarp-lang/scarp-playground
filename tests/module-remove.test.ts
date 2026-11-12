import { describe, expect, it } from 'vitest';
import { previewModuleRemoval } from '../src/module-remove';

const sample = () => ({
  entry: 'main.srp',
  files: {
    'main.srp': 'import "lib/math.srp" as math;\nprint(math.twice(21));',
    'lib/math.srp': 'pub pure funcra twice(n: integer) -> integer { return n * 2; }',
    'unused.srp': '// temporary experiment\n',
  },
});

describe('dependency-aware source removal', () => {
  it('refuses to delete a referenced module and reports exact import sites', () => {
    const workspace = sample();
    const result = previewModuleRemoval(workspace, 'lib/math.srp');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/imported by 1 statement/);
    expect(result.dependents).toEqual([
      { importer: 'main.srp', line: 1, specifier: 'lib/math.srp' },
    ]);
    expect(Object.hasOwn(workspace.files, 'lib/math.srp')).toBe(true);
  });

  it('deletes an unused module while preserving every remaining byte and entrypoint', () => {
    const workspace = sample();
    const result = previewModuleRemoval(workspace, 'unused.srp');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(Object.hasOwn(result.workspace.files, 'unused.srp')).toBe(false);
    expect(result.workspace.entry).toBe('main.srp');
    expect(result.workspace.files['main.srp']).toBe(workspace.files['main.srp']);
    expect(result.workspace.files['lib/math.srp']).toBe(workspace.files['lib/math.srp']);
    expect(result.changedEntry).toBe(false);
  });

  it('selects a deterministic surviving entry when removing the old entry', () => {
    const workspace = sample();
    const result = previewModuleRemoval(workspace, 'main.srp');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.changedEntry).toBe(true);
    expect(result.workspace.entry).toBe('lib/math.srp');
    expect(result.nextActive).toBe('lib/math.srp');
  });

  it('ignores path strings and comments but resolves actual .. imports', () => {
    const workspace = {
      entry: 'main.srp',
      files: {
        'main.srp': '// import "lib/math.srp" as ignored;\n' +
          'bind text = "import \\"lib/math.srp\\" as ignored;";\n' +
          'print("hello");',
        'lib/math.srp': '// a module',
      },
    };
    expect(previewModuleRemoval(workspace, 'lib/math.srp').ok).toBe(true);
    workspace.files['main.srp'] += '\nimport "./lib/math.srp" as math;';
    const result = previewModuleRemoval(workspace, 'lib/math.srp');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.dependents).toHaveLength(1);
  });

  it('does not delete the sole remaining source file', () => {
    const workspace = { entry: 'main.srp', files: { 'main.srp': 'print("hello");' } };
    expect(previewModuleRemoval(workspace, 'main.srp').ok).toBe(false);
  });

  it('fails closed on malformed imports and path traversal', () => {
    const workspace = sample();
    workspace.files['main.srp'] = 'import "lib/math.srp" as ;';
    expect(previewModuleRemoval(workspace, 'unused.srp').ok).toBe(false);
    workspace.files['main.srp'] = 'import "../secrets.srp" as danger;';
    expect(previewModuleRemoval(workspace, 'unused.srp').ok).toBe(false);
    expect(previewModuleRemoval(sample(), '../private.srp').ok).toBe(false);
  });

  it('caps dependency references to bounded output', () => {
    const workspace = {
      entry: 'main.srp',
      files: {
        'main.srp': 'import "lib.srp" as lib;\n'.repeat(121),
        'lib.srp': 'pub bind value = 1;',
      },
    };
    const result = previewModuleRemoval(workspace, 'lib.srp');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/120/);
      expect(result.dependents).toHaveLength(120);
    }
  });

  it('rejects invalid workspaces and nonexistent targets', () => {
    const workspace = sample();
    expect(previewModuleRemoval(workspace, 'missing.srp').ok).toBe(false);
    expect(previewModuleRemoval({ ...workspace, entry: 'missing.srp' },
      'unused.srp').ok).toBe(false);
  });
});
