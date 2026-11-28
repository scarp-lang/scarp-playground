import { describe, expect, it } from 'vitest';
import { decodeSourceFolder, MAX_FOLDER_SELECTION_ENTRIES, planFolderSelection } from '../src/source-folder';
import { MAX_FILE_BYTES, MAX_TOTAL_BYTES } from '../src/workspace';

const encoder = new TextEncoder();
const file = (path: string, text = '') => ({
  name: path.split('/').at(-1)!, webkitRelativePath: path, size: encoder.encode(text).length,
});
const upload = (path: string, text = '') => ({ path, bytes: encoder.encode(text) });

describe('local source folder preflight', () => {
  it('strips exactly one selected root and preserves nested paths and sorted order', () => {
    const plan = planFolderSelection([
      file('My project/lib/math.srp', 'math'),
      file('My project/README.md', 'ignored'),
      file('My project/src/main.srp', 'main'),
      file('My project/scarp.project'),
    ]);
    expect(plan).toEqual({ ok: true, ignored: 2, totalBytes: 8, candidates: [
      { index: 0, path: 'lib/math.srp', size: 4 },
      { index: 2, path: 'src/main.srp', size: 4 },
    ] });
    if (!plan.ok) return;
    const result = decodeSourceFolder(plan, [upload('lib/math.srp', 'math'), upload('src/main.srp', 'main')]);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.workspace.entry).toBe('src/main.srp');
  });

  it('selects root main.srp before src/main.srp and otherwise first sorted file', () => {
    for (const [paths, entry] of [
      [['src/main.srp', 'main.srp', 'a.srp'], 'main.srp'],
      [['z.srp', 'a.srp'], 'a.srp'],
    ] as const) {
      const plan = planFolderSelection(paths.map(path => file('root/' + path)));
      expect(plan.ok).toBe(true);
      if (!plan.ok) continue;
      const decoded = decodeSourceFolder(plan, plan.candidates.map(candidate => upload(candidate.path)));
      expect(decoded.ok).toBe(true);
      if (decoded.ok) expect(decoded.workspace.entry).toBe(entry);
    }
  });

  it('rejects empty selections, missing source paths and inconsistent roots', () => {
    for (const entries of [
      [], [file('root/README.md')], [file('main.srp')], [file('root/a.srp'), file('other/b.srp')],
      [file('/root/main.srp')], [file('../main.srp')], [file('root/../main.srp')],
      [file('root/dir//main.srp')], [file('root/bad name.srp')],
      [file('root/dir\\main.srp')], [file('root/C:/main.srp')],
      [file('root/a.srp'), file('root/a.srp')],
      [{ name: 'different.srp', webkitRelativePath: 'root/main.srp', size: 0 }],
    ]) expect(planFolderSelection(entries).ok).toBe(false);
  });

  it('bounds file counts, raw sizes, aggregate bytes and metadata enumeration', () => {
    const max = Array.from({ length: 12 }, (_, index) => file('root/' + index + '.srp'));
    expect(planFolderSelection(max).ok).toBe(true);
    expect(planFolderSelection([...max, file('root/extra.srp')]).ok).toBe(false);
    expect(planFolderSelection([{ ...file('root/a.srp'), size: MAX_FILE_BYTES + 1 }]).ok).toBe(false);
    expect(planFolderSelection([{ ...file('root/a.srp'), size: -1 }]).ok).toBe(false);
    expect(planFolderSelection([{ ...file('root/a.srp'), size: NaN }]).ok).toBe(false);
    expect(planFolderSelection([
      { ...file('root/a.srp'), size: MAX_FILE_BYTES },
      { ...file('root/b.srp'), size: MAX_FILE_BYTES },
    ]).ok).toBe(true);
    expect(planFolderSelection([
      { ...file('root/a.srp'), size: MAX_FILE_BYTES },
      { ...file('root/b.srp'), size: MAX_TOTAL_BYTES - MAX_FILE_BYTES },
      file('root/c.srp', 'x'),
    ]).ok).toBe(false);
    const ignored = Array.from({ length: MAX_FOLDER_SELECTION_ENTRIES }, (_, i) => file('root/' + i + '.txt'));
    expect(planFolderSelection([...ignored, file('root/main.srp')]).ok).toBe(false);
  });
});

describe('folder source decoding', () => {
  it('preserves Unicode, CRLF and empty files and strips a UTF-8 BOM', () => {
    const source = '\ufeff// नमस्ते 😀\r\nprint(42);\n';
    const plan = planFolderSelection([file('root/main.srp', source), file('root/lib/empty.srp')]);
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    const result = decodeSourceFolder(plan, [upload('lib/empty.srp'), upload('main.srp', source)]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.workspace.files['main.srp']).toBe(source.slice(1));
      expect(result.workspace.files['lib/empty.srp']).toBe('');
    }
  });

  it('rejects invalid UTF-8, changed bytes, missing files and changed paths atomically', () => {
    const plan = planFolderSelection([file('root/main.srp', 'ab'), file('root/z.srp', 'cd')]);
    if (!plan.ok) throw new Error('Expected source plan');
    for (const uploads of [
      [upload('main.srp', 'ab')],
      [upload('main.srp', 'abc'), upload('z.srp', 'cd')],
      [upload('z.srp', 'ab'), upload('main.srp', 'cd')],
      [{ path: 'main.srp', bytes: Uint8Array.of(0xc3, 0x28) }, upload('z.srp', 'cd')],
      [upload('main.srp', 'ab'), upload('main.srp', 'cd')],
    ]) expect(decodeSourceFolder(plan, uploads).ok).toBe(false);
  });
});
