import type { RunResult } from './types';

export type BrowserRunMode = 'run' | 'check' | 'verify';
export type BrowserRunStats = {
  mode: BrowserRunMode;
  elapsedMs: number;
  output: { stdoutBytes: number; stderrBytes: number } | null;
};

/** Main-thread timing includes worker initialization, WASM loading, compilation,
 * execution (when applicable), and response delivery. It is not CPU time.
 * Never trust worker-supplied metrics or retain source/input in this record.
 */
export function describeBrowserRun(
  mode: BrowserRunMode, result: RunResult, started: number, finished: number,
): BrowserRunStats | null {
  const elapsedMs = finished - started;
  if (!Number.isFinite(started) || !Number.isFinite(finished) ||
      !Number.isFinite(elapsedMs) || elapsedMs < 0) return null;
  const encoder = new TextEncoder();
  return {
    mode,
    elapsedMs,
    output: mode === 'run' && result.ok ? {
      stdoutBytes: encoder.encode(result.stdout).byteLength,
      stderrBytes: encoder.encode(result.stderr).byteLength,
    } : null,
  };
}

export function formatBrowserElapsed(ms: number): string {
  return ms < 1 ? '<1 ms' : ms < 1000 ? Math.round(ms) + ' ms' : (ms / 1000).toFixed(2) + ' s';
}
