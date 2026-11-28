import { describe, expect, it } from 'vitest';
import {
  MAX_BASELINE_STREAM_BYTES, MAX_BASELINE_LABEL,
  captureOutputBaseline, compareOutputBaseline,
  type OutputBaseline, type OutputCompareOptions,
} from '../src/output-baseline';
import type { RunResult } from '../src/runner/types';

const run = (stdout = 'First\nSecond\n', stderr = ''): RunResult =>
  ({ ok: true, stdout, stderr });
const options = (values: Partial<OutputCompareOptions> = {}): OutputCompareOptions =>
  ({ stream: 'stdout', ignoreLineEndings: false,
    ignoreTrailingWhitespace: false, context: 2, ...values });
function pinned(stdout = 'First\nSecond\n', stderr = ''): OutputBaseline {
  const r = captureOutputBaseline(run(stdout, stderr));
  if (!r.ok) throw new Error(r.error);
  return r.baseline;
}
function comparison(
  baseline = pinned(), current: RunResult = run('First\nThird\n'),
  opt = options(),
) {
  const result = compareOutputBaseline(baseline, current, opt);
  if (!result.ok) throw new Error(result.error);
  return result;
}

describe('explicit output baseline capture', () => {
  it('captures successful stdout and stderr as an isolated projected object', () => {
    const source = run('Hello\n', 'Warning\n');
    const result = captureOutputBaseline(source);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.baseline).toEqual({
      stdout: 'Hello\n', stderr: 'Warning\n', label: 'Pinned Run',
    });
    expect(result.baseline).not.toBe(source);
  });

  it('can capture an empty successful output for a silent program', () => {
    expect(captureOutputBaseline(run('', '')).ok).toBe(true);
  });

  it('allows a custom Unicode label with no invisible direction controls', () => {
    const result = captureOutputBaseline(run('Hello\n'), 'उदाहरण 😀');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.baseline.label).toBe('उदाहरण 😀');
  });

  it('rejects empty, padded, newline and bidirectional-control labels', () => {
    for (const label of ['', ' ', ' Padded', 'Padded ', 'line\nbreak',
      'x\u202e', 'x\u2066', '\uD800']) {
      expect(captureOutputBaseline(run('ok'), label).ok).toBe(false);
    }
  });

  it('enforces label length by UTF-8 byte count, not UTF-16 length', () => {
    const valid = '😀'.repeat(MAX_BASELINE_LABEL / 4);
    expect(captureOutputBaseline(run('ok'), valid).ok).toBe(true);
    expect(captureOutputBaseline(run('ok'), valid + 'x').ok).toBe(false);
  });

  it('rejects an unsuccessful compiler result instead of comparing its failure envelope', () => {
    const result: RunResult = {
      ok: false, stdout: '', stderr: '', error: 'Worker was terminated',
    };
    expect(captureOutputBaseline(result).ok).toBe(false);
  });

  it('rejects malformed and contradictory successful compiler responses', () => {
    expect(captureOutputBaseline({ ok: true, stdout: 'ok', stderr: '', error: 'bad' }).ok)
      .toBe(false);
    expect(captureOutputBaseline({ ok: false, stdout: 'leak', stderr: '', error: 'failed' }).ok)
      .toBe(false);
  });

  it('rejects over-budget stdout and stderr rather than saving a partial baseline', () => {
    expect(captureOutputBaseline(run('x'.repeat(MAX_BASELINE_STREAM_BYTES + 1))).ok).toBe(false);
    expect(captureOutputBaseline(run('', 'x'.repeat(MAX_BASELINE_STREAM_BYTES + 1))).ok).toBe(false);
  });

  it('accepts valid text at the exact 64 KiB per-stream cap', () => {
    const result = captureOutputBaseline(run('a'.repeat(MAX_BASELINE_STREAM_BYTES)));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.baseline.stdout.length).toBe(MAX_BASELINE_STREAM_BYTES);
  });

  it('rejects malformed surrogate pairs in output without replacing characters', () => {
    expect(captureOutputBaseline(run('\uD800')).ok).toBe(false);
    expect(captureOutputBaseline(run('', '\uDC00')).ok).toBe(false);
  });

  it('accepts UTF-8 Unicode, CRLF and embedded terminal-looking text as literals', () => {
    const text = '😀 हिंदी\r\n<span>literal</span>\n';
    const result = captureOutputBaseline(run(text));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.baseline.stdout).toBe(text);
  });

  it('never includes runtime input, browser diagnostics or source in a pinned baseline', () => {
    const result = captureOutputBaseline({
      ...run('OK\n'), unrelatedSource: 'PRIVATE_SOURCE',
      stdin: 'PRIVATE_STDIN', browserStats: { elapsedMs: 1 },
    } as unknown as RunResult);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(Object.keys(result.baseline).sort()).toEqual(['label', 'stderr', 'stdout']);
    expect(JSON.stringify(result.baseline)).not.toContain('PRIVATE_SOURCE');
    expect(JSON.stringify(result.baseline)).not.toContain('PRIVATE_STDIN');
  });

  it('does not alter the original compiler result or its string values', () => {
    const result = run('exact output', 'exact stderr');
    const before = JSON.stringify(result);
    captureOutputBaseline(result);
    expect(JSON.stringify(result)).toBe(before);
  });
});

describe('source-independent comparison of two successful captured outputs', () => {
  it('reports equal stdout with zero edits', () => {
    const result = comparison(pinned(), run('First\nSecond\n'));
    expect(result.report.identical).toBe(true);
    expect(result.report.changed).toBe(0);
    expect(result.report.hunks).toEqual([]);
  });

  it('reports a changed stdout line with exact previous and current text', () => {
    const result = comparison();
    expect(result.report.changed).toBe(1);
    const changed = result.report.hunks.flatMap(hunk => hunk.rows)
      .find(row => row.kind === 'changed');
    expect(changed).toMatchObject({
      leftText: 'Second', rightText: 'Third',
      leftLine: 2, rightLine: 2,
    });
  });

  it('reports a newly appended line with no invented source lines', () => {
    const result = comparison(pinned('First\n'), run('First\nAdded\n'));
    expect(result.report.added).toBe(1);
    expect(result.report.removed).toBe(0);
  });

  it('reports a removed line without treating it as a changed scalar', () => {
    const result = comparison(pinned('First\nRemoved\n'), run('First\n'));
    expect(result.report.removed).toBe(1);
    expect(result.report.changed).toBe(0);
  });

  it('compares stderr independently from stdout', () => {
    const result = comparison(
      pinned('same stdout\n', 'warning one\n'),
      run('same stdout\n', 'warning two\n'),
      options({ stream: 'stderr' }),
    );
    expect(result.stream).toBe('stderr');
    expect(result.report.changed).toBe(1);
    expect(result.report.hunks[0].rows.some(row =>
      row.rightText === 'warning two')).toBe(true);
  });

  it('does not confuse stderr changes with unchanged stdout', () => {
    const baseline = pinned('unchanged', 'old error');
    const current = run('unchanged', 'new error');
    expect(comparison(baseline, current).report.identical).toBe(true);
    expect(comparison(baseline, current, options({ stream: 'stderr' }))
      .report.identical).toBe(false);
  });

  it('counts source-free output UTF-8 bytes for both snapshots', () => {
    const result = comparison(pinned('😀'), run('हिंदी'));
    expect(result.baselineBytes).toBe(4);
    expect(result.latestBytes).toBe(new TextEncoder().encode('हिंदी').byteLength);
  });

  it('can ignore LF/CRLF without mutating any text', () => {
    const baseline = pinned('line\r\n'), latest = run('line\n');
    expect(comparison(baseline, latest).report.identical).toBe(false);
    expect(comparison(baseline, latest, options({ ignoreLineEndings: true }))
      .report.identical).toBe(true);
    expect(baseline.stdout).toBe('line\r\n');
  });

  it('can ignore trailing whitespace only when explicitly selected', () => {
    const baseline = pinned('line  \n'), latest = run('line\n');
    expect(comparison(baseline, latest).report.identical).toBe(false);
    expect(comparison(baseline, latest, options({ ignoreTrailingWhitespace: true }))
      .report.identical).toBe(true);
  });

  it('does not ignore changed non-trailing indentation', () => {
    const baseline = pinned(' line\n'), latest = run('line\n');
    expect(comparison(baseline, latest, options({ ignoreTrailingWhitespace: true }))
      .report.identical).toBe(false);
  });

  it('preserves Unicode and empty output line positions', () => {
    const result = comparison(pinned('😀\n\nA\n'), run('😀\n\nB\n'));
    const row = result.report.hunks.flatMap(h => h.rows)
      .find(item => item.kind === 'changed');
    expect(row?.leftLine).toBe(3);
    expect(row?.rightLine).toBe(3);
  });

  it('rejects a baseline missing a display label instead of coercing values', () => {
    const baseline = { stdout: 'text', stderr: '', label: '' };
    expect(compareOutputBaseline(baseline, run('text'), options()).ok).toBe(false);
  });

  it('rejects a malformed or over-budget baseline object', () => {
    expect(compareOutputBaseline(null, run('text'), options()).ok).toBe(false);
    expect(compareOutputBaseline({
      label: 'valid', stdout: 'a'.repeat(MAX_BASELINE_STREAM_BYTES + 1), stderr: '',
    }, run('text'), options()).ok).toBe(false);
  });

  it('rejects unsuccessful latest executions without silently comparing stale output', () => {
    expect(compareOutputBaseline(pinned(), {
      ok: false, stdout: '', stderr: '', error: 'Runtime failed',
    }, options()).ok).toBe(false);
  });

  it('requires valid comparison stream, numeric context and strict booleans', () => {
    const variants: Partial<OutputCompareOptions>[] = [
      { stream: 'trace' as OutputCompareOptions['stream'] },
      { context: -1 },
      { context: 1.3 },
      { context: 6 },
      { ignoreLineEndings: 'true' as unknown as boolean },
      { ignoreTrailingWhitespace: null as unknown as boolean },
    ];
    for (const item of variants) {
      expect(compareOutputBaseline(pinned(), run(), options(item)).ok).toBe(false);
    }
  });

  it('refuses unsafe quadratic diffs rather than exhausting the browser', () => {
    const baseline = pinned('a\n'.repeat(1400));
    const result = compareOutputBaseline(baseline, run('b\n'.repeat(1400)), options());
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('bounded diff matrix');
  });

  it('keeps the original pinned baseline immutable after any diff', () => {
    const baseline = pinned('before\n'), snapshot = JSON.stringify(baseline);
    comparison(baseline, run('after\n'));
    expect(JSON.stringify(baseline)).toBe(snapshot);
  });

  it('never includes actual input or source paths in comparison metadata', () => {
    const result = comparison(pinned('one\n'), run('two\n'));
    expect(Object.keys(result).sort()).toEqual([
      'baselineBytes', 'baselineLabel', 'latestBytes', 'ok', 'report', 'stream',
    ]);
    expect(JSON.stringify(result).includes('SECRET_STDIN')).toBe(false);
  });
});
