import { describe, expect, it } from 'vitest';
import { captureLibraryProject, emptyLibrary, libraryNameKey, MAX_LIBRARY_JSON_BYTES, MAX_LIBRARY_PROJECTS,
  MAX_LIBRARY_SOURCE_BYTES, mutateLibrary, parseLibrary, projectBytes, projectMatchesEditor, serializeLibrary,
  validLibraryName, validateLibrary, type LibraryProject, type ProjectLibrary } from '../src/library/model';
import { MAX_FILE_BYTES, type Workspace } from '../src/workspace';

const base = (): Workspace => ({ entry: 'src/main.srp', files: {
  'src/main.srp': 'print("नमस्ते 😀");\r\n', 'lib/empty.srp': '',
} });
function capture(name: string, source = base(), modified = 100): LibraryProject {
  const result = captureLibraryProject(name, source, source.entry, modified);
  if (!result.ok) throw new Error(result.error);
  return result.value;
}
function library(...projects: LibraryProject[]): ProjectLibrary { return { version: 1, projects }; }

describe('named library source-only contract', () => {
  it('captures detached, deterministic source data and ignores unrelated metadata', () => {
    const source = { ...base(), stdin: 'not included', result: { stdout: 'not included' } };
    const captured = capture('Practice', source);
    source.files['src/main.srp'] = 'changed';
    expect(captured.workspace.files['src/main.srp']).toBe('print("नमस्ते 😀");\r\n');
    expect(Object.keys(captured.workspace)).toEqual(['entry', 'files']);
    expect(Object.keys(captured.workspace.files)).toEqual(['lib/empty.srp', 'src/main.srp']);
    const encoded = serializeLibrary(library(captured));
    if (!encoded.ok) throw Error(encoded.error);
    expect(encoded.value).not.toContain('not included');
    expect(parseLibrary(encoded.value)).toEqual({ ok: true, value: library(captured) });
  });

  it('allows ordinary Unicode labels but rejects controls, invalid scalars and whitespace-only names', () => {
    for (const name of ['Practice', 'नमस्ते', 'Café 😀', 'My project 2']) expect(validLibraryName(name)).toBe(true);
    for (const name of ['', ' ', ' test', 'test ', 'a\nb', 'a\u007fb', 'a\u0085b', 'a\u2028b', '\ud800', 'x'.repeat(61)]) {
      expect(validLibraryName(name)).toBe(false);
    }
    expect(libraryNameKey('Cafe\u0301')).toBe(libraryNameKey('CAFÉ'));
  });

  it('rejects collisions and invalid source metadata across the stored list', () => {
    const original = capture('Demo');
    for (const value of [
      null, { version: 2, projects: [] }, { version: 1, projects: Array(1) },
      library(original, capture('demo')), library(capture('Cafe\u0301'), capture('CAFÉ')),
      library({ ...original, modified: -1 }), library({ ...original, modified: Infinity }),
      library({ ...original, activeFile: 'missing.srp' }),
      library({ ...original, workspace: { entry: 'missing.srp', files: {} } }),
      library({ ...original, workspace: { entry: 'main.srp', files: { 'main.srp': '\ud800' } } }),
      library(...Array.from({ length: MAX_LIBRARY_PROJECTS + 1 }, (_, index) => capture('Project ' + index))),
    ]) expect(validateLibrary(value).ok).toBe(false);
  });

  it('bounds total decoded source bytes independently of the number of snapshots', () => {
    const large = { entry: 'main.srp', files: { 'main.srp': 'x'.repeat(MAX_FILE_BYTES), 'lib.srp': 'y'.repeat(MAX_FILE_BYTES) } };
    const entries = Array.from({ length: 4 }, (_, index) => capture('Project ' + index, large));
    expect(entries.reduce((sum, item) => sum + projectBytes(item.workspace), 0)).toBe(MAX_LIBRARY_SOURCE_BYTES);
    expect(validateLibrary(library(...entries)).ok).toBe(true);
    expect(mutateLibrary(library(...entries), { kind: 'add', project: capture('One more') }).ok).toBe(false);
    expect(parseLibrary(' '.repeat(MAX_LIBRARY_JSON_BYTES + 1)).ok).toBe(false);
  });

  it('supports valid JSON with escaped source and does not infer missing saved state from corrupt records', () => {
    const escaped = { entry: 'main.srp', files: { 'main.srp': '\u0000'.repeat(MAX_FILE_BYTES) } };
    const project = capture('Escaped', escaped);
    const raw = serializeLibrary(library(project));
    if (!raw.ok) throw Error(raw.error);
    expect(parseLibrary(raw.value)).toEqual({ ok: true, value: library(project) });
    expect(parseLibrary(null)).toEqual({ ok: true, value: emptyLibrary() });
    expect(parseLibrary(undefined)).toEqual({ ok: true, value: emptyLibrary() });
    for (const corrupt of ['', 'null', '{', '{"version":1}', 4, []]) expect(parseLibrary(corrupt).ok).toBe(false);
  });
});

describe('atomic named project mutation planning', () => {
  it('adds, renames, replaces and removes without mutating an existing snapshot', () => {
    const first = capture('First');
    const second = capture('Second', base(), 200);
    const original = library(first);
    const added = mutateLibrary(original, { kind: 'add', project: second });
    if (!added.ok) throw Error(added.error);
    expect(added.value.projects.map(item => item.name)).toEqual(['Second', 'First']);
    expect(original.projects).toEqual([first]);
    const renamed = mutateLibrary(added.value, { kind: 'rename', name: 'First', nextName: 'New first', modified: 300 });
    if (!renamed.ok) throw Error(renamed.error);
    expect(renamed.value.projects[0].name).toBe('New first');
    expect(renamed.value.projects[0].workspace).toEqual(first.workspace);
    const changed = capture('New first', { entry: 'main.srp', files: { 'main.srp': 'print(42);' } }, 400);
    const replaced = mutateLibrary(renamed.value, { kind: 'replace', name: 'New first', project: changed });
    if (!replaced.ok) throw Error(replaced.error);
    expect(replaced.value.projects[0]).toEqual(changed);
    const removed = mutateLibrary(replaced.value, { kind: 'delete', name: 'Second' });
    expect(removed).toEqual({ ok: true, value: library(changed) });
  });

  it('rejects stale names, duplicate labels and replacement attempts that change identity', () => {
    const first = capture('First');
    const second = capture('Second');
    const original = library(first, second);
    for (const mutation of [
      { kind: 'delete' as const, name: 'Missing' },
      { kind: 'rename' as const, name: 'First', nextName: 'SECOND', modified: 3 },
      { kind: 'replace' as const, name: 'First', project: second },
      { kind: 'add' as const, project: capture('FIRST') },
    ]) expect(mutateLibrary(original, mutation).ok).toBe(false);
    expect(original.projects).toEqual([first, second]);
  });

  it('compares exact source and selected tab, not merely project name or object identity', () => {
    const source = base();
    const project = capture('First', source);
    expect(projectMatchesEditor(project, base(), source.entry)).toBe(true);
    expect(projectMatchesEditor(project, source, 'lib/empty.srp')).toBe(false);
    expect(projectMatchesEditor(project, { ...source, files: { ...source.files, 'lib/empty.srp': ' ' } }, source.entry)).toBe(false);
  });
});
