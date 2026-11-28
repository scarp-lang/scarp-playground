import { describe, expect, it } from 'vitest';
import { createSourceArchive, sourceArchiveProblem } from '../src/source-archive';
import { readStoredZip } from './support/read-stored-zip';
import { MAX_FILE_BYTES, MAX_TOTAL_BYTES, type Workspace } from '../src/workspace';

const decode = (bytes: Uint8Array) => new TextDecoder().decode(bytes);

describe('source-only ZIP export', () => {
  it('preserves nested paths, exact Unicode bytes, CRLF, empty files and sorted order', () => {
    const workspace = { entry: 'app/main.srp', files: {
      'lib/empty.srp': '',
      'app/main.srp': 'import "../lib/math.srp" as math;\r\nprint("नमस्ते 😀");\n',
      'lib/math.srp': 'pub pure funcra twice(n: integer) -> integer { return n * 2; }',
    } };
    const archive = createSourceArchive(workspace);
    expect(archive).not.toBeNull();
    const files = readStoredZip(archive!);
    expect([...files.keys()]).toEqual(['app/main.srp', 'lib/empty.srp', 'lib/math.srp']);
    for (const [path, bytes] of files) {
      expect(bytes).toEqual(new TextEncoder().encode(workspace.files[path as keyof typeof workspace.files]));
    }
  });

  it('produces deterministic bytes without timestamps or extra workspace metadata', () => {
    const first = { entry: 'a.srp', files: { 'a.srp': '123456789', 'b.srp': '' } };
    const second = { entry: 'b.srp', files: { 'b.srp': '', 'a.srp': '123456789' },
      stdin: 'private', output: 'private result', activeFile: 'b.srp' };
    const archive = createSourceArchive(first)!;
    expect(createSourceArchive(second)).toEqual(archive);
    const view = new DataView(archive.buffer);
    expect(view.getUint32(14, true)).toBe(0xcbf43926); // Known IEEE CRC-32 vector.
    expect([...readStoredZip(archive)].map(([path, bytes]) => [path, decode(bytes)])).toEqual([
      ['a.srp', '123456789'], ['b.srp', ''],
    ]);
  });

  it('accepts exact source and total limits without ZIP64 or compression', () => {
    const workspace = { entry: 'a.srp', files: {
      'a.srp': 'a'.repeat(MAX_FILE_BYTES), 'b.srp': 'b'.repeat(MAX_TOTAL_BYTES - MAX_FILE_BYTES),
    } };
    const archive = createSourceArchive(workspace)!;
    expect(archive.byteLength).toBeLessThan(MAX_TOTAL_BYTES + 1024);
    const decoded = readStoredZip(archive);
    expect(decoded.get('a.srp')?.length).toBe(MAX_FILE_BYTES);
    expect(decoded.get('b.srp')?.length).toBe(MAX_FILE_BYTES);
  });

  it('rejects invalid path traversal, absolute paths, invalid extensions and excessive sources', () => {
    for (const name of ['../escape.srp', '/absolute.srp', 'a\\b.srp', 'a//b.srp', 'a.txt', 'C:/a.srp']) {
      expect(createSourceArchive({ entry: 'main.srp', files: { 'main.srp': '', [name]: '' } })).toBeNull();
    }
    expect(createSourceArchive({ entry: 'missing.srp', files: { 'main.srp': '' } })).toBeNull();
    expect(createSourceArchive({ entry: 'main.srp', files: { 'main.srp': '😀'.repeat(MAX_FILE_BYTES / 4 + 1) } })).toBeNull();
    expect(createSourceArchive({ entry: 'main.srp', files: Object.fromEntries([
      ['main.srp', ''], ...Array.from({ length: 12 }, (_, index) => ['file' + index + '.srp', '']),
    ]) })).toBeNull();
    expect(createSourceArchive({ entry: 'main.srp', files: { 'main.srp': 42 } } as unknown as Workspace)).toBeNull();
  });

  it('does not mutate the supplied workspace and supports maximum-length filenames', () => {
    const long = 'a'.repeat(124) + '.srp';
    const workspace = Object.freeze({ entry: long, files: Object.freeze({ [long]: 'print(42);' }) });
    expect([...readStoredZip(createSourceArchive(workspace)!).keys()]).toEqual([long]);
    expect(workspace.files[long]).toBe('print(42);');
  });
});


describe('portable ZIP path admission', () => {
  it('refuses reserved Windows device names at any directory level', () => {
    for (const name of ['CON.srp', 'aux.srp', 'NUL/file.srp', 'COM1/file.srp', 'folder/LPT9.srp', 'prn.srp']) {
      const workspace = { entry: name, files: { [name]: '' } };
      expect(sourceArchiveProblem(workspace)).toContain('reserved Windows device name');
      expect(createSourceArchive(workspace)).toBeNull();
    }
    for (const name of ['console.srp', 'com0.srp', 'lpt10.srp', 'normal/auxiliary.srp']) {
      const workspace = { entry: name, files: { [name]: '' } };
      expect(sourceArchiveProblem(workspace)).toBeNull();
      expect(createSourceArchive(workspace)).not.toBeNull();
    }
  });

  it('refuses ambiguous casing in filenames or nested directory prefixes', () => {
    for (const [first, second] of [
      ['a.srp', 'A.srp'],
      ['Lib/a.srp', 'lib/b.srp'],
      ['src/Types/a.srp', 'src/types/b.srp'],
      ['lib/math.srp', 'lib/Math.srp'],
    ]) {
      const workspace = { entry: first, files: { [first]: '', [second]: '' } };
      expect(sourceArchiveProblem(workspace)).toContain('differ only by letter case');
      expect(createSourceArchive(workspace)).toBeNull();
    }
    const workspace = { entry: 'lib/a.srp', files: { 'lib/a.srp': '', 'lib/b.srp': '', 'other/A.srp': '' } };
    expect(sourceArchiveProblem(workspace)).toBeNull();
    expect(readStoredZip(createSourceArchive(workspace)!).size).toBe(3);
  });
});
