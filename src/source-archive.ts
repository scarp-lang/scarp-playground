import { MAX_FILES, MAX_FILE_BYTES, MAX_TOTAL_BYTES, validPath, validateWorkspace, type Workspace } from './workspace';

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
export function sourceCrc32(bytes: Uint8Array): number {
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
    entries.push({ name, source, crc: sourceCrc32(source), offset: centralStart });
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


// Strict reader for our own deterministic source-only ZIP format. Do not
// interpret arbitrary ZIP metadata, decompress data or expose host paths.
export const MAX_SOURCE_ARCHIVE_BYTES = MAX_TOTAL_BYTES +
  MAX_FILES * (LOCAL_HEADER + CENTRAL_HEADER + 2 * 128) + END_HEADER;

export type SourceArchiveResult =
  | { ok: true; workspace: Workspace }
  | { ok: false; error: string };

function badArchive(error: string): SourceArchiveResult {
  return { ok: false, error };
}

/**
 * Accept only the canonical stored ZIP representation generated by
 * createSourceArchive. This deliberately excludes compressed/encrypted
 * entries, arbitrary extra fields, ZIP64, data descriptors, comments,
 * directory records, symlinks, overlapping ranges and trailing payloads.
 *
 * Decode bounded UTF-8 source bytes and validate paths before reconstructing
 * the canonical archive and comparing every byte, including its directory.
 * This ensures the local and central records cannot disagree.
 */
export function parseSourceArchive(bytes: Uint8Array): SourceArchiveResult {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength < END_HEADER ||
      bytes.byteLength > MAX_SOURCE_ARCHIVE_BYTES) {
    return badArchive('The ZIP is empty, invalid or exceeds the source archive size limit.');
  }
  const end = bytes.byteLength - END_HEADER;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const u16 = (at: number) => view.getUint16(at, true);
  const u32 = (at: number) => view.getUint32(at, true);
  const validRange = (at: number, length: number, limit: number) =>
    Number.isSafeInteger(at) && Number.isSafeInteger(length) && at >= 0 && length >= 0 &&
    at <= limit && length <= limit - at;
  if (u32(end) !== 0x06054b50 || u16(end + 4) !== 0 || u16(end + 6) !== 0 ||
      u16(end + 8) !== u16(end + 10) || u16(end + 20) !== 0) {
    return badArchive('Unsupported ZIP directory. Import a ZIP exported by Scarp Playground.');
  }
  const count = u16(end + 10);
  const centralSize = u32(end + 12);
  const centralStart = u32(end + 16);
  if (count < 1 || count > MAX_FILES || centralSize < count * CENTRAL_HEADER ||
      !validRange(centralStart, centralSize, end) || centralStart + centralSize !== end) {
    return badArchive('Invalid or excessive ZIP source directory.');
  }

  const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
  const files: Record<string, string> = Object.create(null);
  let offset = 0;
  let total = 0;
  for (let index = 0; index < count; index++) {
    if (!validRange(offset, LOCAL_HEADER, centralStart) ||
        u32(offset) !== 0x04034b50 || u16(offset + 4) !== 20 ||
        u16(offset + 6) !== UTF8_FLAG || u16(offset + 8) !== 0 ||
        u16(offset + 10) !== 0 || u16(offset + 12) !== DOS_DATE ||
        u16(offset + 28) !== 0) {
      return badArchive('Unsupported ZIP entry. Only uncompressed Playground source exports are accepted.');
    }
    const checksum = u32(offset + 14);
    const size = u32(offset + 22);
    const nameSize = u16(offset + 26);
    if (u32(offset + 18) !== size || size > MAX_FILE_BYTES ||
        nameSize < 1 || nameSize > 128 ||
        !validRange(offset + LOCAL_HEADER, nameSize + size, centralStart)) {
      return badArchive('Invalid ZIP entry bounds or source file size.');
    }
    total += size;
    if (total > MAX_TOTAL_BYTES) return badArchive('ZIP sources exceed the 128 KiB total limit.');
    const nameStart = offset + LOCAL_HEADER;
    const sourceStart = nameStart + nameSize;
    const payload = bytes.subarray(sourceStart, sourceStart + size);
    let path: string;
    let source: string;
    try {
      path = decoder.decode(bytes.subarray(nameStart, sourceStart));
      source = decoder.decode(payload);
    } catch {
      return badArchive('ZIP contains invalid UTF-8 source or path bytes.');
    }
    if (!validPath(path) || Object.hasOwn(files, path)) {
      return badArchive('ZIP contains an invalid or duplicate relative .srp path.');
    }
    if (sourceCrc32(payload) !== checksum) return badArchive('ZIP source checksum mismatch in ' + path + '.');
    files[path] = source;
    offset = sourceStart + size;
  }
  if (offset !== centralStart) return badArchive('ZIP contains unexpected bytes outside source entries.');

  const paths = Object.keys(files).sort();
  const entry = Object.hasOwn(files, 'main.srp') ? 'main.srp'
    : Object.hasOwn(files, 'src/main.srp') ? 'src/main.srp' : paths[0];
  const workspace = { entry, files };
  const problem = sourceArchiveProblem(workspace);
  if (problem) return badArchive(problem);
  const canonical = createSourceArchive(workspace);
  if (!canonical || canonical.length !== bytes.length ||
      canonical.some((byte, index) => byte !== bytes[index])) {
    return badArchive('ZIP directory or source records are not a canonical Playground export.');
  }
  return { ok: true, workspace };
}
