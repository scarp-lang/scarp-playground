import { describe, expect, it } from 'vitest';
import { SCARP_NUMBER_TOKEN } from '../src/scarp-number-token';

// Verify full-token recognition; Monarch also encounters partial invalid input
// while a student types, so the lexer/compiler remain authoritative.
const matchesEntireToken = (source: string) =>
  new RegExp('^(?:' + SCARP_NUMBER_TOKEN.source + ')$').test(source);

describe('Monaco Scarp number tokenization', () => {
  it('recognizes exact base-ten suffixes and existing numeric forms', () => {
    for (const source of ['0.1d', '42d', '1.20d', '0.1', '42', '1e3', '1.2e-3', '0x2d', '0b101']) {
      expect(matchesEntireToken(source), source).toBe(true);
    }
  });

  it('does not highlight malformed decimal suffixes as whole numbers', () => {
    for (const source of ['0.1D', '1e3d', '0.1dd', '0.1d_more', '42days', '0xg', '0b12']) {
      expect(matchesEntireToken(source), source).toBe(false);
    }
  });
});
