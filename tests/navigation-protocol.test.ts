import { describe, expect, it } from 'vitest';
import { decodeDefinitionReply, validatedDefinitionResult } from '../src/navigation/protocol';
import { MAX_COMPILER_JSON_CHARS } from '../src/runner/protocol';

const target = {
  path: 'lib/math.srp',
  start: { line: 1, column: 17 },
  end: { line: 1, column: 22 },
};

describe('bounded real-compiler definition response', () => {
  it('accepts target and explicit no-definition results', () => {
    expect(decodeDefinitionReply(JSON.stringify({ ok: true, target }))).toEqual({
      ok: true, target,
    });
    expect(validatedDefinitionResult({ ok: true, target: null })).toEqual({
      ok: true, target: null,
    });
  });

  it('rejects malformed or oversized compiler data', () => {
    for (const bad of [
      'not json',
      'x'.repeat(MAX_COMPILER_JSON_CHARS + 1),
      JSON.stringify({ ok: true, target: { ...target, path: '../escape.srp' } }),
      JSON.stringify({ ok: true, target: { ...target, start: { line: 0, column: 1 } } }),
      JSON.stringify({ ok: true, target: { ...target, end: { line: 1, column: 3 } } }),
      JSON.stringify({ ok: true, target: { ...target, start: { line: 1, column: 1.5 } } }),
      JSON.stringify({ ok: true, target: {} }),
      JSON.stringify({ ok: false, error: { unexpected: true } }),
    ]) {
      expect(decodeDefinitionReply(bad)).toMatchObject({
        ok: false, error: expect.stringMatching(/Invalid or oversized/),
      });
    }
  });

  it('preserves validated compiler diagnostic errors without source output', () => {
    const diagnostic = {
      schema_version: 1, severity: 'error', code: 'E0010', message: 'Unknown identifier',
      span_encoding: 'utf-8-bytes', column_encoding: 'unicode-scalar', position_base: 1,
      primary: { path: 'main.srp', span: [0, 7],
        start: { line: 1, column: 1 }, end: { line: 1, column: 8 } },
    };
    expect(validatedDefinitionResult({ ok: false, error: 'Unknown identifier', diagnostic }))
      .toMatchObject({ ok: false, error: 'Unknown identifier', diagnostic });
  });
});
