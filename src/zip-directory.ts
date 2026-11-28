import { MAX_FILES, MAX_FILE_BYTES, MAX_TOTAL_BYTES, validPath } from './workspace';

/** Raw metadata and compressed bytes are bounded independently of source limits. */
export const MAX_IMPORT_ZIP_BYTES = 512 * 1024;
export const MAX_IMPORT_ZIP_ENTRIES = 256;
const LOCAL = 0x04034b50;
const CENTRAL = 0x02014b50;
const END = 0x06054b50;
const DESCRIPTOR = 0x08074b50;
const ALLOWED_FLAGS = 0x080e; // UTF-8, descriptor, deflate compression hints.
const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });

export type ZipSource = {
  path: string;
  method: 0 | 8;
  data: Uint8Array;
  size: number;
  crc: number;
};
export type ZipDirectory = { ok: true; sources: ZipSource[]; ignored: number } |
  { ok: false; error: string };

class ZipProblem extends Error {}
function require(condition: unknown, message: string): asserts condition {
  if (!condition) throw new ZipProblem(message);
}
function safePath(path: string, directory: boolean): boolean {
  const name = directory ? path.slice(0, -1) : path;
  if (!name || name.length > 240 || name.startsWith('/') || name.includes('\\') || name.includes(':')) return false;
  if ([...name].some(char => {
    const code = char.codePointAt(0)!;
    return code < 32 || code === 127 || (code >= 0x80 && code <= 0x9f);
  })) return false;
  return name.split('/').every(part => part.length > 0 && part !== '.' && part !== '..' && !/[ .]$/.test(part));
}

/** Parse classic ZIP directory records without decompression or filesystem I/O.
 * Accept ordinary stored/deflated files, bounded comments, and well-formed
 * metadata extras. Reject encrypted, ZIP64, multi-disk and special entries.
 * Every central entry must correspond to exactly one disjoint local range. */
export function readZipDirectory(bytes: Uint8Array): ZipDirectory {
  try {
    require(bytes instanceof Uint8Array && bytes.length >= 22 && bytes.length <= MAX_IMPORT_ZIP_BYTES,
      'The ZIP is empty, invalid or exceeds the source archive size limit.');
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const u16 = (at: number) => view.getUint16(at, true);
    const u32 = (at: number) => view.getUint32(at, true);
    const range = (at: number, length: number, end: number) =>
      Number.isSafeInteger(at) && Number.isSafeInteger(length) && at >= 0 && length >= 0 && at <= end && length <= end - at;
    const equal = (a: Uint8Array, b: Uint8Array) => a.length === b.length && a.every((byte, index) => byte === b[index]);
    function checkExtra(start: number, length: number) {
      const end = start + length;
      let at = start;
      while (at < end) {
        require(range(at, 4, end), 'Malformed ZIP extra field.');
        const tag = u16(at), size = u16(at + 2);
        require(tag !== 1 && tag !== 0x9901 && tag !== 0x7075, 'ZIP64, AES and alternate Unicode path extras are unsupported.');
        require(range(at + 4, size, end), 'Malformed ZIP extra field.');
        at += 4 + size;
      }
    }
    // The classic EOCD must finish the archive, including its comment.
    // Ambiguous signatures inside a comment are rejected.
    const candidates: number[] = [];
    for (let at = bytes.length - 22; at >= Math.max(0, bytes.length - 22 - 65535); at--) {
      if (u32(at) === END && at + 22 + u16(at + 20) === bytes.length) candidates.push(at);
    }
    require(candidates.length === 1, 'Invalid or ambiguous ZIP end directory.');
    const end = candidates[0];
    require(u16(end + 4) === 0 && u16(end + 6) === 0 && u16(end + 8) === u16(end + 10),
      'Multi-disk ZIP archives are unsupported.');
    const count = u16(end + 10), centralSize = u32(end + 12), centralStart = u32(end + 16);
    require(count > 0 && count <= MAX_IMPORT_ZIP_ENTRIES && centralSize >= count * 46 &&
      range(centralStart, centralSize, end) && centralStart + centralSize === end,
      'Invalid or excessive ZIP central directory.');
    const sources: ZipSource[] = [];
    const localRanges: Array<{ start: number; end: number }> = [];
    const names = new Map<string, { name: string; directory: boolean }>();
    const prefixes = new Map<string, string>();
    let central = centralStart;
    let total = 0;
    let ignored = 0;
    for (let index = 0; index < count; index++) {
      require(range(central, 46, end) && u32(central) === CENTRAL, 'Malformed ZIP central entry.');
      const madeBy = u16(central + 4), needed = u16(central + 6), flags = u16(central + 8);
      const method = u16(central + 10), crc = u32(central + 16), compressed = u32(central + 20), size = u32(central + 24);
      const nameLength = u16(central + 28), extraLength = u16(central + 30), commentLength = u16(central + 32);
      const attributes = u32(central + 38), local = u32(central + 42);
      require(needed <= 20 && (flags & ~ALLOWED_FLAGS) === 0 && (method === 0 || method === 8) &&
        (method === 8 || (flags & 6) === 0) && u16(central + 34) === 0,
        'ZIP contains an unsupported compression, encryption, or version flag.');
      require(nameLength > 0 && nameLength <= 1024 &&
        range(central + 46, nameLength + extraLength + commentLength, end), 'Invalid ZIP central metadata bounds.');
      const nameBytes = bytes.subarray(central + 46, central + 46 + nameLength);
      require((flags & 0x800) !== 0 || nameBytes.every(byte => byte < 128), 'Non-UTF-8 ZIP paths are unsupported.');
      const name = decoder.decode(nameBytes);
      const directory = name.endsWith('/');
      require(safePath(name, directory), 'ZIP contains an unsafe relative path.');
      checkExtra(central + 46 + nameLength, extraLength);
      const unixType = (attributes >>> 16) & 0xf000;
      const host = madeBy >>> 8;
      require((host !== 3 && host !== 19) || unixType === 0 || unixType === (directory ? 0x4000 : 0x8000),
        'ZIP contains a symbolic link or special file.');
      require((attributes & 0x08) === 0 && ((attributes & 0x10) === 0 || directory), 'Invalid ZIP file attributes.');
      if (directory) require(size === 0 && crc === 0, 'ZIP directory contains unexpected data.');
      const path = directory ? name.slice(0, -1) : name;
      const key = path.toLowerCase();
      require(!names.has(key), 'ZIP contains duplicate or case-colliding paths.');
      names.set(key, { name: path, directory });
      let prefix = '';
      for (const part of path.split('/')) {
        prefix += (prefix ? '/' : '') + part;
        const old = prefixes.get(prefix.toLowerCase());
        require(old === undefined || old === prefix, 'ZIP contains case-colliding directory prefixes.');
        prefixes.set(prefix.toLowerCase(), prefix);
      }

      require(range(local, 30, centralStart) && u32(local) === LOCAL, 'Invalid ZIP local entry offset.');
      const localFlags = u16(local + 6), localNameLength = u16(local + 26), localExtra = u16(local + 28);
      require(u16(local + 4) === needed && localFlags === flags && u16(local + 8) === method &&
        localNameLength === nameLength && range(local + 30, localNameLength + localExtra, centralStart),
        'ZIP local and central metadata disagree.');
      require(equal(nameBytes, bytes.subarray(local + 30, local + 30 + localNameLength)), 'ZIP local and central names disagree.');
      checkExtra(local + 30 + localNameLength, localExtra);
      const localCrc = u32(local + 14), localCompressed = u32(local + 18), localSize = u32(local + 22);
      const descriptor = (flags & 8) !== 0;
      require(descriptor ? (localCrc === 0 || localCrc === crc) &&
        (localCompressed === 0 || localCompressed === compressed) && (localSize === 0 || localSize === size)
        : localCrc === crc && localCompressed === compressed && localSize === size,
        'ZIP local and central sizes or checksums disagree.');
      require(method !== 0 || compressed === size, 'Stored ZIP entry has inconsistent sizes.');
      const dataStart = local + 30 + localNameLength + localExtra;
      require(range(dataStart, compressed, centralStart), 'ZIP compressed data extends outside the archive.');
      let localEnd = dataStart + compressed;
      if (descriptor) {
        // Try both classic descriptor forms, rejecting ambiguous encodings.
        const matches: number[] = [];
        if (range(localEnd, 12, centralStart) && u32(localEnd) === crc &&
          u32(localEnd + 4) === compressed && u32(localEnd + 8) === size) matches.push(12);
        if (range(localEnd, 16, centralStart) && u32(localEnd) === DESCRIPTOR && u32(localEnd + 4) === crc &&
          u32(localEnd + 8) === compressed && u32(localEnd + 12) === size) matches.push(16);
        require(matches.length === 1, 'Invalid or ambiguous ZIP data descriptor.');
        localEnd += matches[0];
      }
      localRanges.push({ start: local, end: localEnd });
      if (!directory && name.endsWith('.srp')) {
        require(validPath(name), 'ZIP contains an invalid relative .srp path.');
        require(size <= MAX_FILE_BYTES && sources.length < MAX_FILES, 'ZIP exceeds the per-source byte or file-count limit.');
        total += size;
        require(total <= MAX_TOTAL_BYTES, 'ZIP sources exceed the 128 KiB total limit.');
        sources.push({ path: name, method, data: bytes.subarray(dataStart, dataStart + compressed), size, crc });
      } else if (!directory) ignored++;
      central += 46 + nameLength + extraLength + commentLength;
    }
    require(central === end, 'Unexpected records in ZIP central directory.');
    localRanges.sort((a, b) => a.start - b.start);
    let offset = 0;
    for (const item of localRanges) {
      require(item.start === offset, 'ZIP contains overlapping entries, gaps or extra payload.');
      offset = item.end;
    }
    require(offset === centralStart, 'Unexpected bytes outside ZIP local entries.');
    for (const item of names.values()) {
      const parts = item.name.split('/');
      for (let i = 1; i < parts.length; i++) {
        const parent = names.get(parts.slice(0, i).join('/').toLowerCase());
        require(!parent || parent.directory, 'ZIP contains a file/directory path collision.');
      }
    }
    require(sources.length > 0, 'No lowercase .srp source files found in the ZIP.');
    return { ok: true, sources, ignored };
  } catch (error) {
    return { ok: false, error: error instanceof ZipProblem ? error.message : 'ZIP contains malformed records or invalid UTF-8 paths.' };
  }
}
