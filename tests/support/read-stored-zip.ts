import assert from 'node:assert/strict';

// Test-only structural reader. Validates the central directory against local
// records independently of the writer; never shipped to the browser.
export function readStoredZip(bytes: Uint8Array): Map<string, Uint8Array> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const u16 = (at: number) => view.getUint16(at, true);
  const u32 = (at: number) => view.getUint32(at, true);
  const decoder = new TextDecoder('utf-8', { fatal: true });
  const end = bytes.length - 22;
  assert.equal(u32(end), 0x06054b50);
  assert.equal(u16(end + 4), 0);
  assert.equal(u16(end + 6), 0);
  assert.equal(u16(end + 8), u16(end + 10));
  assert.equal(u16(end + 20), 0);
  const start = u32(end + 16);
  assert.equal(start + u32(end + 12), end);
  let cursor = start;
  let nextLocal = 0;
  const files = new Map<string, Uint8Array>();
  for (let index = 0; index < u16(end + 10); index++) {
    assert.equal(u32(cursor), 0x02014b50);
    assert.equal(u16(cursor + 8), 0x0800);
    assert.equal(u16(cursor + 10), 0);
    assert.equal(u16(cursor + 14), 0x0021);
    const size = u32(cursor + 24);
    assert.equal(u32(cursor + 20), size);
    const nameSize = u16(cursor + 28);
    assert.equal(u16(cursor + 30), 0);
    assert.equal(u16(cursor + 32), 0);
    assert.equal(u32(cursor + 38), 0);
    const local = u32(cursor + 42);
    assert.equal(local, nextLocal);
    assert.equal(u32(local), 0x04034b50);
    assert.equal(u16(local + 6), 0x0800);
    assert.equal(u16(local + 8), 0);
    assert.equal(u16(local + 12), 0x0021);
    assert.equal(u32(local + 14), u32(cursor + 16));
    assert.equal(u32(local + 18), size);
    assert.equal(u32(local + 22), size);
    assert.equal(u16(local + 26), nameSize);
    assert.equal(u16(local + 28), 0);
    const name = decoder.decode(bytes.subarray(cursor + 46, cursor + 46 + nameSize));
    assert.equal(decoder.decode(bytes.subarray(local + 30, local + 30 + nameSize)), name);
    assert.equal(files.has(name), false);
    const content = local + 30 + nameSize;
    nextLocal = content + size;
    assert.ok(nextLocal <= start);
    const payload = bytes.slice(content, nextLocal);
    // Slow bit-by-bit reference CRC; intentionally does not reuse the table.
    let crc = 0xffffffff;
    for (const byte of payload) {
      crc ^= byte;
      for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
    }
    assert.equal((crc ^ 0xffffffff) >>> 0, u32(cursor + 16));
    files.set(name, payload);
    cursor += 46 + nameSize;
  }
  assert.equal(nextLocal, start);
  assert.equal(cursor, end);
  return files;
}
