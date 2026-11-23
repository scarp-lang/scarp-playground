import { describe, expect, it } from 'vitest';
import { previewProgramInputEdit, programInputBytes } from '../src/program-input';
import { MAX_PROGRAM_INPUT_BYTES } from '../src/runner/limits';

describe('byte-accurate buffered input editing', () => {
  it('accepts exact 16 KiB ASCII without truncating any characters', () => {
    const value = 'a'.repeat(MAX_PROGRAM_INPUT_BYTES);
    expect(previewProgramInputEdit('', value)).toEqual({
      accepted: true, value, bytes: MAX_PROGRAM_INPUT_BYTES,
    });
  });

  it('rejects oversized ASCII pastes and preserves the entire previous input', () => {
    const previous = 'stable\n';
    expect(previewProgramInputEdit(previous, 'a'.repeat(MAX_PROGRAM_INPUT_BYTES + 1)))
      .toEqual({ accepted: false, value: previous, bytes: programInputBytes(previous) });
  });

  it('counts multibyte Unicode and astral emoji in UTF-8 rather than UTF-16', () => {
    const valid = '😀'.repeat(MAX_PROGRAM_INPUT_BYTES / 4);
    expect(valid.length).toBe(MAX_PROGRAM_INPUT_BYTES / 2);
    expect(programInputBytes(valid)).toBe(MAX_PROGRAM_INPUT_BYTES);
    expect(previewProgramInputEdit('', valid).accepted).toBe(true);
    expect(previewProgramInputEdit('keep', valid + '😀'))
      .toEqual({ accepted: false, value: 'keep', bytes: 4 });
  });

  it('supports replacement and shrinking, including an exact last-byte boundary', () => {
    const original = '€'.repeat(5000);
    const next = '€'.repeat(5461) + 'x';
    expect(programInputBytes(next)).toBe(MAX_PROGRAM_INPUT_BYTES);
    expect(previewProgramInputEdit(original, next))
      .toEqual({ accepted: true, value: next, bytes: MAX_PROGRAM_INPUT_BYTES });
    expect(previewProgramInputEdit(next, 'x')).toEqual({
      accepted: true, value: 'x', bytes: 1,
    });
  });

  it('never slices a surrogate pair or modifies text after a rejected edit', () => {
    const previous = 'first😀last';
    const candidate = '😀'.repeat(4097);
    const result = previewProgramInputEdit(previous, candidate);
    expect(result.accepted).toBe(false);
    expect(result.value).toBe(previous);
    expect(result.value.includes('😀')).toBe(true);
    expect(programInputBytes(result.value)).toBe(result.bytes);
  });
});
