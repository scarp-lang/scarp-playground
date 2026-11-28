/**
 * JavaScript strings can contain unpaired UTF-16 surrogates. TextEncoder
 * silently substitutes U+FFFD for them, while Rust strings cannot represent
 * them and serde_json may reject them. Count actual scalar bytes without
 * allocation, stopping before scanning arbitrarily large input.
 */
export type Utf8Measurement =
  | { ok: true; bytes: number }
  | { ok: false; reason: 'invalid-unicode' | 'too-large' };

export function measureUtf8(value: string, limit: number): Utf8Measurement {
  if (value.length > limit) return { ok: false, reason: 'too-large' };
  let bytes = 0;
  for (let index = 0; index < value.length; index++) {
    const unit = value.charCodeAt(index);
    if (unit <= 0x7f) bytes++;
    else if (unit <= 0x7ff) bytes += 2;
    else if (unit >= 0xd800 && unit <= 0xdbff) {
      const low = value.charCodeAt(index + 1);
      if (!(low >= 0xdc00 && low <= 0xdfff)) return { ok: false, reason: 'invalid-unicode' };
      index++;
      bytes += 4;
    } else if (unit >= 0xdc00 && unit <= 0xdfff) {
      return { ok: false, reason: 'invalid-unicode' };
    } else bytes += 3;
    if (bytes > limit) return { ok: false, reason: 'too-large' };
  }
  return { ok: true, bytes };
}

export function isUtf8Text(value: string, limit: number): boolean {
  return measureUtf8(value, limit).ok;
}
