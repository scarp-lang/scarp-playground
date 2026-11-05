import { describe, expect, it } from 'vitest';
import { editorPositionToByteOffset } from '../src/navigation/coordinates';

describe('Monaco UTF-16 to compiler UTF-8 source offsets', () => {
  it('preserves ASCII and column-after-token boundaries', () => {
    expect(editorPositionToByteOffset('bind x = 2;', 1, 6)).toBe(5);
    expect(editorPositionToByteOffset('bind x = 2;', 1, 12)).toBe(11);
  });

  it('converts astral characters and disallows the middle of surrogate pairs', () => {
    const source = 'a😀b';
    expect(editorPositionToByteOffset(source, 1, 1)).toBe(0);
    expect(editorPositionToByteOffset(source, 1, 2)).toBe(1);
    expect(editorPositionToByteOffset(source, 1, 3)).toBeNull();
    expect(editorPositionToByteOffset(source, 1, 4)).toBe(5);
    expect(editorPositionToByteOffset(source, 1, 5)).toBe(6);
  });

  it('counts CRLF and standalone LF bytes while leaving Unicode scalars intact', () => {
    const source = 'é😀\r\nx\ny';
    expect(editorPositionToByteOffset(source, 2, 1)).toBe(8);
    expect(editorPositionToByteOffset(source, 2, 2)).toBe(9);
    expect(editorPositionToByteOffset(source, 3, 1)).toBe(10);
  });

  it('rejects out-of-range, fractional, negative and non-existent positions', () => {
    for (const [line, col] of [[0,1], [1,0], [-1,1], [1,2.5], [2,1], [1,4]]) {
      expect(editorPositionToByteOffset('x', line, col)).toBeNull();
    }
    expect(editorPositionToByteOffset('x', 1, 2)).toBe(1);
  });
});
