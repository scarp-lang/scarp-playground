import { describe, expect, it } from 'vitest';
import { describeBrowserRun, formatBrowserElapsed } from '../src/runner/browser-stats';

describe('local browser operation statistics', () => {
  it('counts separate UTF-8 streams rather than UTF-16 code units', () => {
    expect(describeBrowserRun('run', { ok: true, stdout: '😀\n', stderr: 'é' }, 10, 20.5))
      .toEqual({ mode: 'run', elapsedMs: 10.5, output: { stdoutBytes: 5, stderrBytes: 2 } });
  });
  it('distinguishes successful empty output from unavailable measurements', () => {
    expect(describeBrowserRun('run', { ok: true, stdout: '', stderr: '' }, 0, 0)?.output)
      .toEqual({ stdoutBytes: 0, stderrBytes: 0 });
    for (const mode of ['verify', 'check'] as const) {
      expect(describeBrowserRun(mode, { ok: true, stdout: '', stderr: '' }, 1, 2)?.output).toBeNull();
    }
    expect(describeBrowserRun('run', { ok: false, stdout: '', stderr: '', error: 'failed' }, 1, 2)?.output)
      .toBeNull();
  });
  it('rejects impossible clock values and never includes source or error content', () => {
    const result = { ok: false, stdout: '', stderr: '', error: 'private diagnostic' };
    for (const [start, end] of [[2, 1], [NaN, 5], [1, Infinity], [-Number.MAX_VALUE, Number.MAX_VALUE]]) {
      expect(describeBrowserRun('run', result, start, end)).toBeNull();
    }
    expect(JSON.stringify(describeBrowserRun('run', result, 1, 2))).not.toContain(result.error);
  });
  it('formats submillisecond, millisecond and second durations', () => {
    expect(formatBrowserElapsed(0)).toBe('<1 ms');
    expect(formatBrowserElapsed(12.3)).toBe('12 ms');
    expect(formatBrowserElapsed(1234)).toBe('1.23 s');
  });
});
