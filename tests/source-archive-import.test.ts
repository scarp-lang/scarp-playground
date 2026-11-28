import { describe, expect, it } from 'vitest';
import { createSourceArchive, parseSourceArchive, MAX_SOURCE_ARCHIVE_BYTES } from '../src/source-archive';
import { MAX_FILE_BYTES, MAX_TOTAL_BYTES, type Workspace } from '../src/workspace';

const project: Workspace = { entry: 'src/main.srp', files: {
  'src/main.srp': '\ufeff// नमस्ते 😀\r\nimport "../lib/math.srp" as math;\r\nprint(math.twice(21));\n',
  'lib/math.srp': 'pub pure funcra twice(n: integer) -> integer { return n * 2; }',
  'empty.srp': '',
} };

function archive() {
  return createSourceArchive(project)!;
}

function mutate(change: (bytes: Uint8Array, view: DataView) => void) {
  const bytes = archive();
  change(bytes, new DataView(bytes.buffer));
  return parseSourceArchive(bytes);
}

describe('canonical source ZIP import', () => {
  it('round-trips exact Unicode, BOM, CRLF, nested paths and empty files', () => {
    const bytes = archive();
    const result = parseSourceArchive(bytes);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.workspace.entry).toBe('src/main.srp');
    expect(result.workspace.files).toEqual(project.files);
    expect(createSourceArchive(result.workspace)).toEqual(bytes);
  });

  it('handles typed-array slices with nonzero byte offsets', () => {
    const bytes = archive();
    const padded = new Uint8Array(bytes.length + 9);
    padded.set(bytes, 5);
    expect(parseSourceArchive(padded.subarray(5, 5 + bytes.length))).toEqual(parseSourceArchive(bytes));
  });

  it('accepts maximum legal source payloads within bounded ZIP overhead', () => {
    const before = { entry: 'a.srp', files: {
      'a.srp': 'a'.repeat(MAX_FILE_BYTES),
      'b.srp': 'b'.repeat(MAX_TOTAL_BYTES - MAX_FILE_BYTES),
    } };
    const bytes = createSourceArchive(before)!;
    expect(bytes.length).toBeLessThan(MAX_SOURCE_ARCHIVE_BYTES);
    expect(parseSourceArchive(bytes)).toEqual({ ok: true, workspace: before });
    expect(parseSourceArchive(new Uint8Array(MAX_SOURCE_ARCHIVE_BYTES + 1)).ok).toBe(false);
  });

  it('rejects all proper prefixes and any trailing data without throwing', () => {
    const bytes = archive();
    for (let length = 0; length < bytes.length; length++) {
      expect(parseSourceArchive(bytes.subarray(0, length)).ok).toBe(false);
    }
    const appended = new Uint8Array(bytes.length + 1);
    appended.set(bytes);
    expect(parseSourceArchive(appended).ok).toBe(false);
  });

  it('rejects unsupported local flags, methods, extras and oversized entries', () => {
    for (const [offset, value] of [[4, 45], [6, 1], [6, 8], [8, 8], [10, 1], [12, 0], [28, 1]]) {
      expect(mutate((_bytes, view) => view.setUint16(offset, value, true)).ok).toBe(false);
    }
    expect(mutate((_bytes, view) => view.setUint32(22, 0xffffffff, true)).ok).toBe(false);
    expect(mutate((_bytes, view) => view.setUint32(18, 123, true)).ok).toBe(false);
    expect(mutate((_bytes, view) => view.setUint16(26, 129, true)).ok).toBe(false);
  });

  it('rejects corrupt source bytes and checksum metadata', () => {
    // The first entry is empty, so corrupt the second entry payload.
    const result = mutate((bytes, view) => {
      const second = 30 + view.getUint16(26, true) + view.getUint32(22, true);
      const body = second + 30 + view.getUint16(second + 26, true);
      bytes[body] ^= 1;
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('checksum');
    expect(mutate((_bytes, view) => view.setUint32(14, 1, true)).ok).toBe(false);
  });

  it('rejects malformed paths and inconsistent central records', () => {
    expect(mutate(bytes => { bytes[30] = 0xff; }).ok).toBe(false);
    expect(mutate(bytes => { bytes.set(new TextEncoder().encode('../'), 30); }).ok).toBe(false);
    for (const [field, value] of [[4, 0x0314], [8, 1], [10, 8], [30, 1], [32, 1], [38, 0x8000], [42, 12]]) {
      expect(mutate((bytes, view) => {
        const central = view.getUint32(bytes.length - 6, true);
        view.setUint16(central + field, value, true);
      }).ok).toBe(false);
    }
  });

  it('rejects multidisk, invalid counts, forged offsets and directory sizes', () => {
    for (const [field, value] of [[4, 1], [6, 1], [8, 0], [10, 13], [20, 1]]) {
      expect(mutate((bytes, view) => view.setUint16(bytes.length - 22 + field, value, true)).ok).toBe(false);
    }
    for (const field of [12, 16]) {
      expect(mutate((bytes, view) => view.setUint32(bytes.length - 22 + field, 0xffffffff, true)).ok).toBe(false);
    }
  });
});
