import { describe, expect, it } from 'vitest';
import {
  MAX_RUN_HISTORY, RUN_HISTORY_EXPORT_FORMAT, RUN_HISTORY_EXPORT_VERSION,
  appendRunHistory, makeRunHistoryEntry, validateRunHistory, filterRunHistory,
  summarizeRunHistory, compareRecentRun, formatRunElapsed,
  serializeRunHistory, parseRunHistoryExport,
  type RunHistoryEntry, type RunOutcome,
} from '../src/run-history';
import type { RunResult } from '../src/runner/types';
import type { BrowserRunMode, BrowserRunStats } from '../src/runner/browser-stats';

const success: RunResult = { ok: true, stdout: 'private source output', stderr: '' };
const failure: RunResult = { ok: false, stdout: '', stderr: '', error: 'private source text',
  diagnostic: { schema_version: 1, severity: 'error', code: 'E0010', message: 'Secret diagnostic' } };
const stats = (mode: BrowserRunMode, elapsedMs = 10): BrowserRunStats => ({
  mode, elapsedMs, output: mode === 'run' ? { stdoutBytes: 22, stderrBytes: 0 } : null,
});
const entry = (
  sequence: number, elapsedMs: number, mode: BrowserRunMode = 'run',
  outcome: RunOutcome = 'success',
): RunHistoryEntry => ({
  sequence, mode, outcome, elapsedMs,
  stdoutBytes: mode === 'run' && outcome === 'success' ? 0 : null,
  stderrBytes: mode === 'run' && outcome === 'success' ? 0 : null,
  diagnosticCode: outcome === 'diagnostic' ? 'E0010' : null,
});

describe('privacy-preserving browser run history', () => {
  it('retains mode, elapsed milliseconds and output byte counts, never program content', () => {
    const result = makeRunHistoryEntry(1, 'run', success, stats('run'));
    expect(result).toEqual({
      sequence: 1, mode: 'run', outcome: 'success', elapsedMs: 10,
      stdoutBytes: 22, stderrBytes: 0, diagnosticCode: null,
    });
    expect(JSON.stringify(result)).not.toContain('private');
  });

  it('records only structured compiler diagnostic codes', () => {
    const record = makeRunHistoryEntry(7, 'check', failure, stats('check'));
    expect(record).toEqual({
      sequence: 7, mode: 'check', outcome: 'diagnostic', elapsedMs: 10,
      stdoutBytes: null, stderrBytes: null, diagnosticCode: 'E0010',
    });
    expect(JSON.stringify(record)).not.toMatch(/Secret|private/);
  });

  it('ignores invalid diagnostic codes rather than retaining unexpected text', () => {
    const invalid: RunResult = {
      ...failure, diagnostic: { ...failure.diagnostic!, code: 'SECRET SOURCE' },
    };
    const record = makeRunHistoryEntry(1, 'run', invalid, stats('run'));
    expect(record?.diagnosticCode).toBeNull();
    expect(record?.outcome).toBe('diagnostic');
  });

  it('classifies browser timeouts and cancellation without preserving error messages', () => {
    const timeout = { ...failure, diagnostic: null, error: 'Execution exceeded the 12-second browser limit.' };
    const cancelled = { ...failure, diagnostic: null, error: 'Execution cancelled.' };
    expect(makeRunHistoryEntry(1, 'run', timeout, stats('run'))?.outcome).toBe('timeout');
    expect(makeRunHistoryEntry(1, 'run', cancelled, stats('run'))?.outcome).toBe('cancelled');
    expect(makeRunHistoryEntry(1, 'run', { ...failure, diagnostic: null }, stats('run'))?.outcome).toBe('error');
  });

  it('records no output counts for checks, verification, or failed runs', () => {
    for (const mode of ['check', 'verify'] as const) {
      const record = makeRunHistoryEntry(1, mode, success, stats(mode));
      expect(record?.stdoutBytes).toBeNull();
      expect(record?.stderrBytes).toBeNull();
    }
    const failed = makeRunHistoryEntry(1, 'run', failure, stats('run'));
    expect(failed?.stdoutBytes).toBeNull();
  });

  it('refuses invalid sequence numbers, modes, stats and timing', () => {
    for (const sequence of [-1, 0, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
      expect(makeRunHistoryEntry(sequence, 'run', success, stats('run'))).toBeNull();
    }
    for (const elapsedMs of [-1, NaN, Infinity, 60_001]) {
      expect(makeRunHistoryEntry(1, 'run', success, stats('run', elapsedMs))).toBeNull();
    }
    expect(makeRunHistoryEntry(1, 'run', success, stats('check'))).toBeNull();
    expect(makeRunHistoryEntry(1, 'other' as BrowserRunMode, success, stats('run'))).toBeNull();
    expect(makeRunHistoryEntry(1, 'run', success, null)).toBeNull();
  });

  it('rejects malformed or forged byte counts', () => {
    for (const stdoutBytes of [-1, 2.5, NaN, Infinity, 1_048_577, 'secret']) {
      const forged = { ...stats('run'), output: { stdoutBytes, stderrBytes: 0 } };
      expect(makeRunHistoryEntry(1, 'run', success, forged as BrowserRunStats)).toBeNull();
    }
  });

  it('adds immutable entries and increments sequence numbers', () => {
    const initial = [entry(9, 3, 'verify')];
    const next = appendRunHistory(initial, 'check', success, stats('check', 5));
    expect(initial).toHaveLength(1);
    expect(next).toHaveLength(2);
    expect(next[1].sequence).toBe(10);
    expect(next[1].mode).toBe('check');
  });

  it('bounds history to the most recent 60 entries', () => {
    let current: RunHistoryEntry[] = [];
    for (let index = 1; index <= MAX_RUN_HISTORY + 15; index++) {
      current = appendRunHistory(current, 'run', success, stats('run', index));
    }
    expect(current).toHaveLength(MAX_RUN_HISTORY);
    expect(current[0].sequence).toBe(16);
    expect(current.at(-1)?.sequence).toBe(MAX_RUN_HISTORY + 15);
  });

  it('keeps previous history when the new compiler timing is invalid', () => {
    const before = [entry(1, 4)];
    const after = appendRunHistory(before, 'run', success, stats('run', Infinity));
    expect(after).toEqual(before);
    expect(after).not.toBe(before);
  });

  it('rejects a sequence integer overflow rather than wrapping', () => {
    const before = [entry(Number.MAX_SAFE_INTEGER, 4)];
    expect(appendRunHistory(before, 'run', success, stats('run'))).toEqual(before);
  });

  it('strips all unknown fields from run-history imports', () => {
    const sourceBearing = { ...entry(1, 3), source: 'secret', stdin: 'private', diagnostic: { message: 'secret' } };
    expect(validateRunHistory([sourceBearing])).toEqual([entry(1, 3)]);
    expect(JSON.stringify(validateRunHistory([sourceBearing]))).not.toMatch(/private|secret/);
  });

  it('rejects duplicate, descending and invalid records', () => {
    const invalid: unknown[] = [
      [entry(2, 3), entry(2, 4)],
      [entry(5, 3), entry(4, 4)],
      [{ ...entry(1, 1), elapsedMs: -3 }],
      [{ ...entry(1, 1), mode: 'unknown' }],
      [{ ...entry(1, 1), outcome: 'wrong' }],
      [{ ...entry(1, 1), diagnosticCode: 'SOURCE' }],
      [{ ...entry(1, 1), stdoutBytes: -1 }],
      [{ ...entry(1, 1), stdoutBytes: 1, stderrBytes: null }],
      Array.from({ length: MAX_RUN_HISTORY + 1 }, (_, i) => entry(i + 1, i)),
      null, {}, 1, 'not an array',
    ];
    for (const value of invalid) {
      expect(validateRunHistory(value)).toBeNull();
    }
  });

  it('handles empty input and safely returns no aggregates', () => {
    expect(validateRunHistory([])).toEqual([]);
    expect(summarizeRunHistory([])).toEqual({
      count: 0, succeeded: 0, failed: 0, p50Ms: null, p90Ms: null,
      minMs: null, maxMs: null, averageMs: null, totalOutputBytes: 0,
    });
    expect(compareRecentRun([])).toBeNull();
  });

  it('computes sorted percentiles and arithmetic mean on bounded elapsed durations', () => {
    const current = [entry(1, 40), entry(2, 10), entry(3, 20), entry(4, 30)];
    expect(summarizeRunHistory(current)).toMatchObject({
      count: 4, succeeded: 4, failed: 0, minMs: 10, maxMs: 40,
      p50Ms: 25, p90Ms: 37, averageMs: 25,
    });
  });

  it('includes failed operations but excludes any error body in aggregates', () => {
    const current = [entry(1, 12), entry(2, 14, 'check', 'error'),
      entry(3, 10, 'verify', 'diagnostic')];
    expect(summarizeRunHistory(current)).toMatchObject({
      count: 3, succeeded: 1, failed: 2,
    });
  });

  it('counts successful output UTF-8 byte metrics only once', () => {
    const first = { ...entry(1, 5), stdoutBytes: 6, stderrBytes: 3 };
    const second = entry(2, 12, 'check');
    expect(summarizeRunHistory([first, second]).totalOutputBytes).toBe(9);
  });

  it('filters by operation and outcome without reordering source arrays', () => {
    const current = [entry(1, 1, 'run'), entry(2, 2, 'check', 'error'),
      entry(3, 3, 'run', 'diagnostic')];
    expect(filterRunHistory(current, { mode: 'run', outcome: 'all' })
      .map(item => item.sequence)).toEqual([1, 3]);
    expect(filterRunHistory(current, { mode: 'all', outcome: 'error' })
      .map(item => item.sequence)).toEqual([2]);
    expect(filterRunHistory(current, { mode: 'verify', outcome: 'all' })).toEqual([]);
    expect(filterRunHistory(current, { mode: 'fake' as BrowserRunMode, outcome: 'all' })).toEqual([]);
    expect(current.map(item => item.sequence)).toEqual([1, 2, 3]);
  });

  it('compares only preceding runs of the same operation', () => {
    const current = [entry(1, 10), entry(2, 200, 'check'),
      entry(3, 15), entry(4, 0, 'verify'), entry(5, 20)];
    const comparison = compareRecentRun(current);
    expect(comparison).toMatchObject({
      current: { sequence: 5 },
      previous: { sequence: 3 },
      changeMs: 5, percentChange: 100 / 3,
    });
    expect(compareRecentRun(current, 1)).toMatchObject({
      current: { sequence: 1 }, previous: null, changeMs: null,
      percentChange: null,
    });
    expect(compareRecentRun(current, 999)).toBeNull();
  });

  it('protects divide-by-zero when comparing an earlier instantaneous run', () => {
    const current = [entry(1, 0), entry(2, 12)];
    const result = compareRecentRun(current);
    expect(result?.changeMs).toBe(12);
    expect(result?.percentChange).toBeNull();
  });

  it('formats submillisecond, millisecond and second durations', () => {
    expect(formatRunElapsed(0)).toBe('<1 ms');
    expect(formatRunElapsed(1.2)).toBe('1 ms');
    expect(formatRunElapsed(1444)).toBe('1.44 s');
    expect(formatRunElapsed(-1)).toBe('—');
    expect(formatRunElapsed(null)).toBe('—');
    expect(formatRunElapsed(Infinity)).toBe('—');
  });

  it('serializes a source-free, valid metadata envelope', () => {
    const original = [entry(1, 5), { ...entry(2, 8, 'check', 'diagnostic'),
      diagnosticCode: 'E0010' }];
    const payload = serializeRunHistory(original)!;
    const parsed = JSON.parse(payload);
    expect(parsed.format).toBe(RUN_HISTORY_EXPORT_FORMAT);
    expect(parsed.version).toBe(RUN_HISTORY_EXPORT_VERSION);
    expect(parsed.entries).toEqual(original);
    expect(parsed.summary.count).toBe(2);
    expect(payload).not.toMatch(/"source"|"stdin"|"message"|"help"|private/i);
    expect(parseRunHistoryExport(payload)).toEqual(original);
  });

  it('does not trust unrecognized export envelopes or hostile oversized text', () => {
    const valid = serializeRunHistory([entry(1, 2)])!;
    for (const bad of [
      null, 9, {}, '', 'x'.repeat(48_001), '{',
      valid.replace(RUN_HISTORY_EXPORT_FORMAT, 'foreign-application'),
      valid.replace('"version": 1', '"version": 9'),
      JSON.stringify({ format: RUN_HISTORY_EXPORT_FORMAT, version: 1, entries: [{}] }),
    ]) expect(parseRunHistoryExport(bad)).toBeNull();
    expect(serializeRunHistory([{ ...entry(1, 4), outcome: 'wrong' as RunOutcome }])).toBeNull();
  });

  it('rejects sparse arrays and unknown nested objects before export', () => {
    const sparse: RunHistoryEntry[] = new Array(1);
    expect(validateRunHistory(sparse)).toBeNull();
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    expect(validateRunHistory([{ ...entry(1, 7), unexpected: cyclic }])).toEqual([entry(1, 7)]);
  });
});
