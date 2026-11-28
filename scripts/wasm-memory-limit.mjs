/**
 * Independently inspect a compiled WebAssembly binary for an enforced maximum
 * on every declared or imported linear memory. This does NOT measure or cap
 * JavaScript heap, DOM, Worker scaffolding, native browser overhead, or CPU.
 *
 * The parser deliberately recognizes only the bounded binary structures
 * necessary to inspect the Wasm32 memory section and memory imports.
 */
export const WASM_PAGE_BYTES = 64 * 1024;
export const MAX_WASM_LINEAR_MEMORY_BYTES = 512 * 1024 * 1024;
export const MAX_WASM_LINEAR_MEMORY_PAGES =
  MAX_WASM_LINEAR_MEMORY_BYTES / WASM_PAGE_BYTES;

const MAGIC_AND_VERSION = new Uint8Array([0x00, 0x61, 0x73, 0x6d, 1, 0, 0, 0]);
const MAX_BINARY_BYTES = 64 * 1024 * 1024;

class Reader {
  constructor(bytes, start = 0, end = bytes.length) {
    this.bytes = bytes;
    this.at = start;
    this.end = end;
  }
  byte() {
    if (this.at >= this.end) throw new Error('Truncated WebAssembly binary.');
    return this.bytes[this.at++];
  }
  unsigned() {
    let value = 0;
    for (let index = 0; index < 5; index++) {
      const part = this.byte();
      if (index === 4 && (part & 0xf0) !== 0) {
        throw new Error('Invalid or overflowing Wasm32 LEB128 integer.');
      }
      value += (part & 0x7f) * 2 ** (index * 7);
      if ((part & 0x80) === 0) return value;
    }
    throw new Error('Overlong Wasm32 LEB128 integer.');
  }
  skip(length) {
    if (!Number.isSafeInteger(length) || length < 0 || this.at + length > this.end) {
      throw new Error('Invalid WebAssembly binary field length.');
    }
    this.at += length;
  }
  name() {
    this.skip(this.unsigned());
  }
  section(length) {
    if (!Number.isSafeInteger(length) || length > this.end - this.at) {
      throw new Error('Truncated WebAssembly section.');
    }
    const child = new Reader(this.bytes, this.at, this.at + length);
    this.at += length;
    return child;
  }
  finish() {
    if (this.at !== this.end) {
      throw new Error('Unexpected trailing bytes in a WebAssembly section.');
    }
  }
}

function limits(reader, kind) {
  const flags = reader.unsigned();
  // memory64, shared memory, and future/unknown flags are not supported by
  // the pinned single-threaded Wasm32 bridge and must never be assumed safe.
  if ((flags & ~0x01) !== 0) {
    throw new Error('Unsupported WebAssembly ' + kind + ' limit flags.');
  }
  const initialPages = reader.unsigned();
  const maximumPages = flags & 1 ? reader.unsigned() : null;
  return { initialPages, maximumPages };
}

function importedMemories(reader) {
  const count = reader.unsigned();
  if (count > 100_000) throw new Error('Excessive WebAssembly import count.');
  const memory = [];
  for (let index = 0; index < count; index++) {
    reader.name();
    reader.name();
    const kind = reader.byte();
    switch (kind) {
      case 0: // function type index
        reader.unsigned();
        break;
      case 1: // table reference type and limits
        reader.byte();
        limits(reader, 'table');
        break;
      case 2: // imported linear memory
        memory.push(limits(reader, 'memory'));
        break;
      case 3: // global type and mutability
        reader.byte();
        reader.byte();
        break;
      case 4: // exception tag attribute and type index
        reader.unsigned();
        reader.unsigned();
        break;
      default:
        throw new Error('Unsupported WebAssembly import kind.');
    }
  }
  reader.finish();
  return memory;
}

function locallyDeclaredMemories(reader) {
  const count = reader.unsigned();
  if (count > 1) {
    throw new Error('Unexpected multiple declared memories in a browser compiler.');
  }
  const memory = [];
  for (let index = 0; index < count; index++) {
    memory.push(limits(reader, 'memory'));
  }
  reader.finish();
  return memory;
}

export function inspectWasmMemoryLimits(binary, maximumBytes = MAX_WASM_LINEAR_MEMORY_BYTES) {
  if (!(binary instanceof Uint8Array) || binary.length < 8 ||
      binary.length > MAX_BINARY_BYTES ||
      !Number.isSafeInteger(maximumBytes) || maximumBytes < WASM_PAGE_BYTES ||
      maximumBytes % WASM_PAGE_BYTES !== 0) {
    throw new Error('Invalid or oversized WebAssembly input or configured memory limit.');
  }
  for (let index = 0; index < 8; index++) {
    if (binary[index] !== MAGIC_AND_VERSION[index]) {
      throw new Error('Invalid WebAssembly magic or binary version.');
    }
  }

  const reader = new Reader(binary, 8);
  const memories = [];
  let sawImportSection = false;
  let sawMemorySection = false;
  while (reader.at < reader.end) {
    const sectionId = reader.byte();
    const section = reader.section(reader.unsigned());
    if (sectionId === 2) {
      if (sawImportSection) throw new Error('Duplicate WebAssembly import section.');
      sawImportSection = true;
      memories.push(...importedMemories(section));
    } else if (sectionId === 5) {
      if (sawMemorySection) throw new Error('Duplicate WebAssembly memory section.');
      sawMemorySection = true;
      memories.push(...locallyDeclaredMemories(section));
    }
  }

  if (memories.length !== 1) {
    throw new Error('Expected exactly one bounded WebAssembly linear memory.');
  }
  const memory = memories[0];
  if (memory.maximumPages === null) {
    throw new Error('The WebAssembly memory declaration has no hard maximum.');
  }
  const allowedPages = maximumBytes / WASM_PAGE_BYTES;
  if (memory.maximumPages > allowedPages || memory.maximumPages > 65_536) {
    throw new Error('WebAssembly linear memory maximum exceeds the reviewed byte limit.');
  }
  if (memory.initialPages > memory.maximumPages) {
    throw new Error('WebAssembly initial memory exceeds its declared maximum.');
  }
  return {
    initialPages: memory.initialPages,
    maximumPages: memory.maximumPages,
    initialBytes: memory.initialPages * WASM_PAGE_BYTES,
    maximumBytes: memory.maximumPages * WASM_PAGE_BYTES,
  };
}
