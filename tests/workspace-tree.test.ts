import { describe, expect, it } from 'vitest';
import { buildSourceTree, folderContains, NEW_MODULE_SOURCE, previewNewSource, type SourceTreeFolder } from '../src/workspace-tree';
import { MAX_FILE_BYTES, MAX_TOTAL_BYTES, type Workspace } from '../src/workspace';

const fixture = (): Workspace => ({
  entry: 'src/main.srp',
  files: {
    'z.srp': '',
    'src/main.srp': 'print("😀");\r\n',
    'src/lib/math.srp': 'pub bind answer = 42;',
    'src/lib/empty.srp': '',
    'src-old/spare.srp': '// old',
    'a.srp': '// a',
  },
});

describe('virtual source tree', () => {
  it('sorts folders before files, preserves case and computes exact recursive UTF-8 totals', () => {
    const workspace = fixture();
    const original = JSON.stringify(workspace);
    const tree = buildSourceTree(workspace);
    expect(tree.error).toBeNull();
    expect(tree.nodes.map(node => node.path)).toEqual(['src', 'src-old', 'a.srp', 'z.srp']);
    const src = tree.nodes[0] as SourceTreeFolder;
    expect(src.children.map(node => node.path)).toEqual(['src/lib', 'src/main.srp']);
    expect(src.fileCount).toBe(3);
    expect(src.children[1]).toMatchObject({ kind: 'file', entry: true, bytes: new TextEncoder().encode(workspace.files['src/main.srp']).byteLength });
    expect(src.bytes).toBe(new TextEncoder().encode(workspace.files['src/main.srp'] + workspace.files['src/lib/math.srp']).byteLength);
    expect(tree.totalBytes).toBe(Object.values(workspace.files).reduce((sum, source) => sum + new TextEncoder().encode(source).byteLength, 0));
    expect(tree.total).toBe(6);
    expect(tree.matched).toBe(6);
    expect(JSON.stringify(workspace)).toBe(original);
  });

  it('filters full paths literally and case-insensitively without searching source contents', () => {
    const tree = buildSourceTree(fixture(), ' LIB/ ');
    expect(tree.matched).toBe(2);
    expect(tree.total).toBe(6);
    expect(tree.nodes.map(node => node.path)).toEqual(['src']);
    expect((tree.nodes[0] as SourceTreeFolder).fileCount).toBe(2);
    expect(buildSourceTree(fixture(), 'answer').matched).toBe(0);
    expect(buildSourceTree(fixture(), '.*').matched).toBe(0);
    expect(buildSourceTree(fixture(), 'src/').matched).toBe(3);
    expect(folderContains('src', 'src-old/spare.srp')).toBe(false);
    expect(folderContains('src', 'src/lib/math.srp')).toBe(true);
  });

  it('supports maximum-depth legal paths and invalid workspaces fail closed', () => {
    const deep = 'a/'.repeat(60) + 'b.srp';
    const workspace = { entry: deep, files: { [deep]: '' } };
    expect(buildSourceTree(workspace).matched).toBe(1);
    expect(buildSourceTree({ entry: 'missing.srp', files: {} }).error).not.toBeNull();
  });
});

describe('new source admission', () => {
  it('adds a nested source without altering entrypoint, existing files or input object', () => {
    const before = fixture();
    const original = JSON.stringify(before);
    const result = previewNewSource(before, 'src/lib/new.srp');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.workspace.entry).toBe(before.entry);
    expect(result.workspace.files['src/lib/new.srp']).toBe(NEW_MODULE_SOURCE);
    for (const path of Object.keys(before.files)) expect(result.workspace.files[path]).toBe(before.files[path]);
    expect(JSON.stringify(before)).toBe(original);
  });

  it('rejects conflicts, unsafe paths and full projects', () => {
    for (const path of ['src/main.srp', '../escape.srp', '/root.srp', 'bad.txt', 'bad path.srp']) {
      expect(previewNewSource(fixture(), path).ok).toBe(false);
    }
    const files = Object.fromEntries(Array.from({ length: 12 }, (_, index) => ['f' + index + '.srp', '']));
    expect(previewNewSource({ entry: 'f0.srp', files }, 'new.srp').ok).toBe(false);
  });

  it('checks aggregate source bytes before creating the file', () => {
    const before = { entry: 'main.srp', files: {
      'main.srp': 'x'.repeat(MAX_FILE_BYTES),
      'other.srp': 'y'.repeat(MAX_TOTAL_BYTES - MAX_FILE_BYTES),
    } };
    expect(previewNewSource(before, 'new.srp').ok).toBe(false);
    expect(Object.keys(before.files)).toHaveLength(2);
  });
});
