import { deflateRawSync } from 'node:zlib';

/** Independent ZIP fixture writer, deliberately not using the app's parser
 * or canonical writer. Supports ordinary DOS/Unix entries and descriptors. */
export type ZipFixture = {
  name: string;
  source: string | Uint8Array;
  method?: 0 | 8;
  descriptor?: 'signed' | 'unsigned';
  unixMode?: number;
  size?: number;
  flags?: number;
  extra?: Uint8Array;
};
function crc(data: Uint8Array): number {
  let value = 0xffffffff;
  for (const byte of data) {
    value ^= byte;
    for (let bit = 0; bit < 8; bit++) value = (value >>> 1) ^ ((value & 1) ? 0xedb88320 : 0);
  }
  return (value ^ 0xffffffff) >>> 0;
}
export function ordinaryZip(entries: ZipFixture[], comment = ''): Buffer {
  const local: Buffer[] = [], central: Buffer[] = [];
  let offset = 0;
  for (const item of entries) {
    const name = Buffer.from(item.name);
    const source = Buffer.from(item.source);
    const method = item.method ?? 0;
    const compressed = method === 8 ? deflateRawSync(source) : source;
    const checksum = crc(source), size = item.size ?? source.length;
    const flags = item.flags ?? (0x800 | (item.descriptor ? 8 : 0));
    const extra = Buffer.from(item.extra ?? []);
    const head = Buffer.alloc(30);
    head.writeUInt32LE(0x04034b50, 0);
    head.writeUInt16LE(20, 4);
    head.writeUInt16LE(flags, 6);
    head.writeUInt16LE(method, 8);
    head.writeUInt16LE(0x5abc, 10);
    head.writeUInt16LE(0x5d1c, 12);
    if (!item.descriptor) {
      head.writeUInt32LE(checksum, 14);
      head.writeUInt32LE(compressed.length, 18);
      head.writeUInt32LE(size, 22);
    }
    head.writeUInt16LE(name.length, 26);
    head.writeUInt16LE(extra.length, 28);
    let trailer = Buffer.alloc(0);
    if (item.descriptor) {
      const signed = item.descriptor === 'signed';
      trailer = Buffer.alloc(signed ? 16 : 12);
      if (signed) trailer.writeUInt32LE(0x08074b50, 0);
      const at = signed ? 4 : 0;
      trailer.writeUInt32LE(checksum, at);
      trailer.writeUInt32LE(compressed.length, at + 4);
      trailer.writeUInt32LE(size, at + 8);
    }
    const directory = Buffer.alloc(46);
    directory.writeUInt32LE(0x02014b50, 0);
    directory.writeUInt16LE(0x314, 4);
    directory.writeUInt16LE(20, 6);
    directory.writeUInt16LE(flags, 8);
    directory.writeUInt16LE(method, 10);
    directory.writeUInt16LE(0x5abc, 12);
    directory.writeUInt16LE(0x5d1c, 14);
    directory.writeUInt32LE(checksum, 16);
    directory.writeUInt32LE(compressed.length, 20);
    directory.writeUInt32LE(size, 24);
    directory.writeUInt16LE(name.length, 28);
    directory.writeUInt16LE(extra.length, 30);
    directory.writeUInt32LE(((item.unixMode ?? (item.name.endsWith('/') ? 0x41ed : 0x81a4)) << 16) >>> 0, 38);
    directory.writeUInt32LE(offset, 42);
    const record = Buffer.concat([head, name, extra, compressed, trailer]);
    local.push(record);
    central.push(Buffer.concat([directory, name, extra]));
    offset += record.length;
  }
  const listing = Buffer.concat(central), note = Buffer.from(comment), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(listing.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(note.length, 20);
  return Buffer.concat([...local, listing, end, note]);
}
