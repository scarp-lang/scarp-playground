import { describe, expect, it } from 'vitest';
import { decodeCompilerReply, decodeWorkerResult, MAX_COMPILER_JSON_CHARS, MAX_OUTPUT_BYTES } from '../src/runner/protocol';

const success = { ok: true, stdout: 'Hello\\n', stderr: '' };
const diagnostic = {
  schema_version: 1, severity: 'error', code: 'E0010', message: 'Unknown identifier',
  span_encoding: 'utf-8-bytes', column_encoding: 'unicode-scalar', position_base: 1,
  primary: { path: 'lib/math.srp', span: [0, 7], start: { line: 1, column: 1 }, end: { line: 1, column: 8 } },
  related: [{ message: 'Imported here', location: null }], help: null,
};

describe('bounded compiler-worker protocol', () => {
  it('accepts real compiler-shaped output and diagnostic envelopes', () => {
    expect(decodeCompilerReply(JSON.stringify(success))).toEqual(success);
    const failure = { ok: false, stdout: '', stderr: '', error: 'unknown identifier', diagnostic };
    expect(decodeCompilerReply(JSON.stringify(failure))).toEqual(failure);
    expect(decodeWorkerResult(failure)).toEqual(failure);
  });

  it('rejects malformed or oversized JSON before parsing', () => {
    expect(decodeCompilerReply('{').ok).toBe(false);
    expect(decodeCompilerReply('x'.repeat(MAX_COMPILER_JSON_CHARS + 1)).ok).toBe(false);
  });

  it('rejects malformed worker outputs and excess bytes', () => {
    for (const bad of [
      null, {}, { ...success, ok: 'yes' }, { ...success, stdout: [] },
      { ...success, stderr: null }, { ...success, error: { nested: 'object' } },
      { ...success, stdout: 'a'.repeat(MAX_OUTPUT_BYTES + 1) },
      { ...success, stdout: 'a'.repeat(MAX_OUTPUT_BYTES), stderr: 'extra' },
    ]) {
      expect(decodeWorkerResult(bad)).toMatchObject({
        ok: false, error: expect.stringMatching(/Invalid or oversized/),
      });
    }
  });

  it('validates source locations and related diagnostic notes', () => {
    const base = { ...success, ok: false };
    for (const bad of [
      { ...diagnostic, schema_version: 2 },
      { ...diagnostic, primary: { ...diagnostic.primary, path: [] } },
      { ...diagnostic, primary: { ...diagnostic.primary, start: { line: 0, column: 1 } } },
      { ...diagnostic, primary: { ...diagnostic.primary, span: [7, 0] } },
      { ...diagnostic, related: Array.from({ length: 65 }, () => diagnostic.related[0]) },
    ]) expect(decodeWorkerResult({ ...base, diagnostic: bad }).ok).toBe(false);
  });

  it('respects UTF-8 bytes and the exact output boundary', () => {
    expect(decodeWorkerResult({ ...success, stdout: 'x'.repeat(MAX_OUTPUT_BYTES) }).ok).toBe(true);
    expect(decodeWorkerResult({ ...success, stdout: '😀'.repeat(MAX_OUTPUT_BYTES / 4 + 1) }).ok).toBe(false);
  });
});
