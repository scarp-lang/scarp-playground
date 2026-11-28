import { describe, expect, it } from 'vitest';
import { inflateRawSync } from 'node:zlib';
import { ordinaryZip } from './support/ordinary-zip';
import { readZipDirectory, MAX_IMPORT_ZIP_BYTES } from '../src/zip-directory';
import { importSourceZip, inflateZipSource } from '../src/zip-import';
import { createSourceArchive } from '../src/source-archive';
import { MAX_FILE_BYTES } from '../src/workspace';

const inflate = async (bytes: Uint8Array, size: number) => Uint8Array.from(inflateRawSync(bytes, { maxOutputLength: Math.max(1, size) }));

describe('ordinary ZIP source directory', () => {
  it('reads stored, deflated, descriptor and directory entries without interpreting ignored files', async () => {
    const input = ordinaryZip([
      { name: 'src/', source: '' },
      { name: 'src/main.srp', source: 'print("नमस्ते 😀");\r\n', method: 8, descriptor: 'signed' },
      { name: 'lib.srp', source: 'pub bind n = 1;', descriptor: 'unsigned' },
      { name: 'README.md', source: 'not source', method: 8 },
    ], 'archive comment');
    const plan = readZipDirectory(input);
    expect(plan.ok).toBe(true);
    if (!plan.ok) throw Error(plan.error);
    expect(plan.ignored).toBe(1);
    expect(plan.sources.map(item => item.path)).toEqual(['src/main.srp', 'lib.srp']);
    const called: number[] = [];
    const result = await importSourceZip(input, async (data, size) => { called.push(size); return inflate(data, size); });
    expect(result).toEqual({ ok: true, ignored: 1, workspace: { entry: 'src/main.srp', files: {
      'src/main.srp': 'print("नमस्ते 😀");\r\n', 'lib.srp': 'pub bind n = 1;',
    } } });
    expect(called).toHaveLength(1);
  });
  it('keeps canonical archive compatibility, empty files and BOM bytes', async () => {
    const workspace = { entry: 'main.srp', files: { 'main.srp': '\ufeffprint(1);\n', 'empty.srp': '' } };
    expect(await importSourceZip(createSourceArchive(workspace)!)).toEqual({ ok: true, workspace, ignored: 0 });
    expect(await importSourceZip(ordinaryZip([{ name: 'main.srp', source: '' }]))).toEqual({
      ok: true, workspace: { entry: 'main.srp', files: { 'main.srp': '' } }, ignored: 0,
    });
  });
  it('rejects unsafe paths, special files, collisions and unsupported flags before inflation', async () => {
    const invalid = [
      [{ name: '../main.srp', source: '' }], [{ name: '/main.srp', source: '' }],
      [{ name: 'x\\main.srp', source: '' }], [{ name: 'C:/main.srp', source: '' }],
      [{ name: 'main.srp', source: '', unixMode: 0xa1ff }],
      [{ name: 'main.srp', source: '', flags: 0x801 }],
      [{ name: 'main.srp', source: '', extra: Uint8Array.of(1, 0, 0, 0) }],
      [{ name: 'main.srp', source: '' }, { name: 'MAIN.srp', source: '' }],
      [{ name: 'src/a.srp', source: '' }, { name: 'SRC/b.srp', source: '' }],
      [{ name: 'src', source: '' }, { name: 'src/a.srp', source: '' }],
      [{ name: 'README.md', source: '' }],
      [{ name: 'main.srp', source: '', size: MAX_FILE_BYTES + 1, method: 8 as const }],
    ];
    for (const entries of invalid) {
      expect((await importSourceZip(ordinaryZip(entries), async () => { throw Error('must not inflate'); })).ok).toBe(false);
    }
    expect(readZipDirectory(new Uint8Array(MAX_IMPORT_ZIP_BYTES + 1)).ok).toBe(false);
  });
  it('rejects malformed central/local records, offsets, trailing data and CRC', async () => {
    const zip = ordinaryZip([{ name: 'main.srp', source: 'print(1);' }]);
    const end = zip.length - 22, central = zip.readUInt32LE(end + 16);
    const changed = (fn: (bytes: Buffer) => void) => { const copy = Buffer.from(zip); fn(copy); return copy; };
    for (const input of [
      changed(bytes => bytes.writeUInt32LE(1, central + 42)),
      changed(bytes => bytes.writeUInt32LE(1, central + 24)),
      changed(bytes => bytes[30] ^= 1),
      Buffer.concat([zip, Buffer.from('trailing')]),
      changed(bytes => bytes[38] ^= 1),
    ]) expect((await importSourceZip(input, inflate)).ok).toBe(false);
  });
  it('rejects false declared sizes and invalid UTF-8 without exposing partial files', async () => {
    const bad = ordinaryZip([{ name: 'main.srp', source: 'valid' },
      { name: 'bad.srp', source: Uint8Array.of(0xc3, 0x28) }]);
    expect(await importSourceZip(bad, inflate)).toMatchObject({ ok: false, error: expect.stringContaining('invalid UTF-8') });
    expect((await importSourceZip(ordinaryZip([{ name: 'main.srp', source: 'too much', method: 8, size: 1 }]), inflate)).ok).toBe(false);
  });
  it('bounds real native browser-compatible raw deflate streaming', async () => {
    const zip = ordinaryZip([{ name: 'main.srp', source: 'a'.repeat(4096), method: 8 }]);
    const parsed = readZipDirectory(zip);
    if (!parsed.ok) throw Error(parsed.error);
    const data = parsed.sources[0].data;
    expect((await inflateZipSource(data, 4096)).length).toBe(4096);
    await expect(inflateZipSource(data, 3)).rejects.toThrow();
    await expect(inflateZipSource(data, 4097)).rejects.toThrow();
  });
});
