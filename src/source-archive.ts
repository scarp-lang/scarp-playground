import { validateWorkspace, type Workspace } from './workspace';

const LOCAL_HEADER = 30;
const CENTRAL_HEADER = 46;
const END_HEADER = 22;
const UTF8_FLAG = 0x0800;
const DOS_DATE = 0x0021; // 1980-01-01; stable output, no host timestamps.

const crcTable = Uint32Array.from({ length: 256 }, (_, index) => {
  let crc = index;
  for (let bit = 0; bit < 8; bit++) {
    crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return crc >>> 0;
});

/** Standard IEEE CRC-32 used by ZIP. Not an authenticity or security hash. */
function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = (crc >>> 8) ^ crcTable[(crc ^ byte) & 0xff];
  return (crc ^ 0xffffffff) >>> 0;
}

type ArchiveEntry = {
  name: Uint8Array;
  source: Uint8Array;
  crc: number;
  offset: number;
};

// Virtual editor paths may be valid on Linux but unsafe or ambiguous when
// extracted by Windows or a case-insensitive filesystem. Do not rename or
// merge these paths silently; the JSON export remains available.
export function sourceArchiveProblem(workspace: Workspace): string | null {
  const failure = validateWorkspace(workspace);
  if (failure) return failure;
  const prefixes = new Map<string, string>();
  for (const path of Object.keys(workspace.files).sort()) {
    const parts = path.split('/');
    let prefix = '';
    for (const part of parts) {
      const stem = part.split('.')[0];
      if (/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(stem)) {
        return 'The path ' + path + ' contains a reserved Windows device name.';
      }
      prefix += (prefix ? '/' : '') + part;
      const folded = prefix.toLowerCase();
      const previous = prefixes.get(folded);
      if (previous !== undefined && previous !== prefix) {
        return 'Paths differ only by letter case: ' + previous + ' and ' + prefix + '.';
      }
      prefixes.set(folded, prefix);
    }
  }
  return null;
}

/**
 * Encode a deterministic, classic ZIP archive with stored (uncompressed)
 * UTF-8 .srp files. All paths and bytes must first pass the same workspace
 * validation as browser execution. No JSON metadata, stdin, results, local
 * storage, host paths, directory records, symlinks or network requests.
 *
 * Workspace caps make ZIP64, compression and data descriptors unnecessary.
 */
export function createSourceArchive(workspace: Workspace): Uint8Array<ArrayBuffer> | null {
  if (sourceArchiveProblem(workspace)) return null;
  const encoder = new TextEncoder();
  const entries: ArchiveEntry[] = [];
  let centralStart = 0;
  let centralSize = 0;
  for (const path of Object.keys(workspace.files).sort()) {
    const name = encoder.encode(path);
    const source = encoder.encode(workspace.files[path]);
    entries.push({ name, source, crc: crc32(source), offset: centralStart });
    centralStart += LOCAL_HEADER + name.length + source.length;
    centralSize += CENTRAL_HEADER + name.length;
  }

  const archive = new Uint8Array(centralStart + centralSize + END_HEADER);
  const view = new DataView(archive.buffer);
  const u16 = (at: number, value: number) => view.setUint16(at, value, true);
  const u32 = (at: number, value: number) => view.setUint32(at, value, true);
  let central = centralStart;

  for (const { name, source, crc, offset } of entries) {
    // Local file header: PK 03 04, version 2.0, method 0 (store).
    u32(offset, 0x04034b50);
    u16(offset + 4, 20);
    u16(offset + 6, UTF8_FLAG);
    u16(offset + 12, DOS_DATE);
    u32(offset + 14, crc);
    u32(offset + 18, source.length);
    u32(offset + 22, source.length);
    u16(offset + 26, name.length);
    archive.set(name, offset + LOCAL_HEADER);
    archive.set(source, offset + LOCAL_HEADER + name.length);

    // Central directory mirrors local entries with their exact byte offsets.
    u32(central, 0x02014b50);
    u16(central + 4, 20); // Version made by, DOS host (no Unix symlink bits).
    u16(central + 6, 20); // Version needed.
    u16(central + 8, UTF8_FLAG);
    u16(central + 14, DOS_DATE);
    u32(central + 16, crc);
    u32(central + 20, source.length);
    u32(central + 24, source.length);
    u16(central + 28, name.length);
    u32(central + 42, offset);
    archive.set(name, central + CENTRAL_HEADER);
    central += CENTRAL_HEADER + name.length;
  }

  // End of central directory: single disk, no archive comment.
  u32(central, 0x06054b50);
  u16(central + 8, entries.length);
  u16(central + 10, entries.length);
  u32(central + 12, centralSize);
  u32(central + 16, centralStart);
  return archive;
}
