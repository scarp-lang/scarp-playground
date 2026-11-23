import { describe, expect, it } from 'vitest';
import { previewSourceImport } from '../src/source-import';
import { MAX_FILE_BYTES, MAX_FILES, MAX_TOTAL_BYTES, type Workspace } from '../src/workspace';

const bytes = (text: string) => new TextEncoder().encode(text);
const baseline = (): Workspace => ({
  entry: 'main.srp',
  files: { 'main.srp': 'import "math.srp" as math;\r\nprint(math.twice(21));\r\n' },
});

describe('atomic local .srp source file import', () => {
  it('adds several files without mutating existing source or entry, retaining Unicode and CRLF', () => {
    const original = baseline();
    const initial = original.files['main.srp'];
    const result = previewSourceImport(original, [
      { path: 'math.srp', bytes: bytes('pub bind value = "नमस्ते";\r\n') },
      { path: 'helper.srp', bytes: bytes('print("😀");\n') },
    ]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.addedPaths).toEqual(['math.srp', 'helper.srp']);
    expect(result.workspace.entry).toBe('main.srp');
    expect(result.workspace.files['main.srp']).toBe(initial);
    expect(result.workspace.files['math.srp']).toBe('pub bind value = "नमस्ते";\r\n');
    expect(result.workspace.files['helper.srp']).toBe('print("😀");\n');
    expect(Object.keys(original.files)).toEqual(['main.srp']);
  });

  it('rejects collisions, duplicate uploads, invalid paths and mixed batches atomically', () => {
    const original = baseline();
    const cases = [
      [{ path: 'main.srp', bytes: bytes('print(0);') }],
      [{ path: 'good.srp', bytes: bytes('') }, { path: 'main.srp', bytes: bytes('') }],
      [{ path: 'same.srp', bytes: bytes('') }, { path: 'same.srp', bytes: bytes('') }],
      [{ path: '../secret.srp', bytes: bytes('') }],
      [{ path: 'bad name.srp', bytes: bytes('') }],
      [{ path: 'scarp.project', bytes: bytes('') }],
    ];
    for (const uploads of cases) {
      const result = previewSourceImport(original, uploads);
      expect(result.ok).toBe(false);
      expect(Object.keys(original.files)).toEqual(['main.srp']);
    }
  });

  it('rejects invalid UTF-8 and oversized individual files, accepting an optional UTF-8 BOM', () => {
    const original = baseline();
    const badUtf8 = previewSourceImport(original, [
      { path: 'broken.srp', bytes: Uint8Array.of(0xc3, 0x28) },
    ]);
    expect(badUtf8.ok).toBe(false);
    if (!badUtf8.ok) expect(badUtf8.error).toContain('UTF-8');
    expect(previewSourceImport(original, [
      { path: 'big.srp', bytes: bytes('x'.repeat(MAX_FILE_BYTES + 1)) },
    ]).ok).toBe(false);
    const bom = previewSourceImport(original, [
      { path: 'bom.srp', bytes: Uint8Array.of(0xef, 0xbb, 0xbf, 0x70, 0x0a) },
    ]);
    expect(bom.ok).toBe(true);
    if (bom.ok) expect(bom.workspace.files['bom.srp']).toBe('p\n');
  });

  it('enforces the aggregate source and file count limits before any commit', () => {
    const original = baseline();
    const alreadyFull: Workspace = {
      entry: 'main.srp',
      files: Object.fromEntries(Array.from({ length: MAX_FILES }, (_, index) =>
        [index === 0 ? 'main.srp' : 'file' + index + '.srp', '']),
      ),
    };
    expect(previewSourceImport(alreadyFull, [{ path: 'another.srp', bytes: bytes('') }]).ok).toBe(false);
    expect(previewSourceImport(original, [
      { path: 'other.srp', bytes: bytes('x'.repeat(MAX_TOTAL_BYTES)) },
    ]).ok).toBe(false);

    const nearLimit: Workspace = {
      entry: 'main.srp', files: {
        'main.srp': 'x'.repeat(MAX_FILE_BYTES),
        'other.srp': 'x'.repeat(MAX_FILE_BYTES - 1),
      },
    };
    expect(previewSourceImport(nearLimit, [{ path: 'last.srp', bytes: bytes('x') }]).ok).toBe(true);
    expect(previewSourceImport(nearLimit, [{ path: 'last.srp', bytes: bytes('xx') }]).ok).toBe(false);
    expect(previewSourceImport(original, []).ok).toBe(false);
  });
});
