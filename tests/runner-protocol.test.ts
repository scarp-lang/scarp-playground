import { describe, expect, it } from 'vitest';
import { decodeCompilerReply, decodeWorkerResult, decodeSilentResult, decodeVerifyResult, MAX_COMPILER_JSON_CHARS, MAX_OUTPUT_BYTES } from '../src/runner/protocol';

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


  it('drops unknown fields at every diagnostic depth and never forwards cycles', () => {
    const cycle: Record<string, unknown> = {};
    cycle.self = cycle;
    const richLocation = {
      ...diagnostic.primary, extra: cycle,
      start: { ...diagnostic.primary.start, extra: cycle },
      end: { ...diagnostic.primary.end, extra: cycle },
    };
    const response = {
      ok: false, stdout: '', stderr: '', error: 'unknown identifier', extra: cycle,
      diagnostic: {
        ...diagnostic, extra: cycle, primary: richLocation,
        related: [{ message: 'Imported here', location: richLocation, extra: cycle }],
      },
    };
    const expected = {
      ok: false, stdout: '', stderr: '', error: 'unknown identifier',
      diagnostic: {
        ...diagnostic,
        related: [{ message: 'Imported here', location: diagnostic.primary }],
      },
    };
    const decoded = decodeWorkerResult(response);
    expect(decoded).toEqual(expected);
    expect(decoded.diagnostic?.primary?.span).not.toBe(response.diagnostic.primary.span);
    expect(() => JSON.stringify(decoded)).not.toThrow();
    expect(decodeSilentResult(response)).toEqual(expected);
  });

  it('projects JSON replies and successful structured-cloned results onto known fields', () => {
    const response = { ...success, extra: { nested: 'unrecognized payload' } };
    expect(decodeCompilerReply(JSON.stringify(response))).toEqual(success);
    expect(decodeWorkerResult(response)).toEqual(success);
    const silent = { ok: true, stdout: '', stderr: '', extra: response };
    expect(decodeSilentResult(silent)).toEqual({ ok: true, stdout: '', stderr: '' });
  });

  it('strictly suppresses forged stdout and stderr in static verification mode', () => {
    expect(decodeVerifyResult({ ok: true, stdout: '', stderr: '' })).toEqual({
      ok: true, stdout: '', stderr: '',
    });
    for (const forged of [
      { ok: true, stdout: 'secret', stderr: '' },
      { ok: false, stdout: '', stderr: 'side effect', error: 'compile failed' },
      { ok: true, stdout: [], stderr: '' },
    ]) {
      const result = decodeVerifyResult(forged);
      expect(result.ok).toBe(false);
      expect(result.stdout).toBe('');
      expect(result.stderr).toBe('');
      expect(result.error).toMatch(/Invalid or oversized/);
    }
  });

  it('rejects contradictory success or partial failure output at both protocol boundaries', () => {
    for (const bad of [
      { ok: false, stdout: 'leak', stderr: '', error: 'runtime failed' },
      { ok: false, stdout: '', stderr: 'leak', error: 'runtime failed' },
      { ok: true, stdout: '', stderr: '', error: 'contradiction' },
      { ok: true, stdout: '', stderr: '', diagnostic },
    ]) {
      expect(decodeWorkerResult(bad)).toMatchObject({
        ok: false, stdout: '', stderr: '',
        error: expect.stringMatching(/Invalid or oversized/),
      });
      expect(decodeCompilerReply(JSON.stringify(bad)).error).toMatch(/Invalid or oversized/);
    }
  });

  it('rejects stdout and stderr in Check as well as Verify, preserving valid failures', () => {
    const failure = { ok: false, stdout: '', stderr: '', error: 'E0010', diagnostic };
    expect(decodeSilentResult(failure)).toEqual(failure);
    for (const output of [
      { ...success, stdout: 'accidental output' },
      { ...success, stderr: 'stderr from Check' },
    ]) {
      expect(decodeSilentResult(output).error).toMatch(/Invalid or oversized/);
      expect(decodeVerifyResult(output).ok).toBe(false);
    }
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
