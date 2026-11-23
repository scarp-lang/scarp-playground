import { describe, expect, it } from 'vitest';
import { consoleTranscript } from '../src/runner/transcript';
import { decodeWorkerResult } from '../src/runner/protocol';
import type { RunResult } from '../src/runner/types';

const success: RunResult = { ok: true, stdout: '', stderr: '' };

describe('browser-only compiler result export', () => {
  it('disables export before execution and for silent successful modes', () => {
    expect(consoleTranscript(null, 'run')).toBeNull();
    expect(consoleTranscript(success, 'run')).toBeNull();
    expect(consoleTranscript(success, 'check')).toBeNull();
    expect(consoleTranscript(success, 'verify')).toBeNull();
    expect(consoleTranscript({ ...success, stdout: 'hidden' }, 'verify')).toBeNull();
  });

  it('preserves exact Unicode and newline bytes in a single stream', () => {
    expect(consoleTranscript({ ...success, stdout: 'नमस्ते 🌍\r\n' }, 'run'))
      .toBe('नमस्ते 🌍\r\n');
    expect(consoleTranscript({ ...success, stderr: 'warning\n' }, 'run'))
      .toBe('warning\n');
  });

  it('labels separate streams, without inventing a chronological event order', () => {
    expect(consoleTranscript({ ...success, stdout: 'hello\n', stderr: 'oops\n' }, 'run'))
      .toBe('stdout:\nhello\nstderr:\noops\n');
    expect(consoleTranscript({ ...success, stdout: 'hello', stderr: 'oops' }, 'run'))
      .toBe('stdout:\nhello\nstderr:\noops');
  });

  it('formats diagnostic codes, locations, hints and related locations', () => {
    const failed: RunResult = {
      ok: false, stdout: '', stderr: '', error: 'Compiler rejected program',
      diagnostic: {
        schema_version: 1, severity: 'error', code: 'E0010',
        message: 'Unknown identifier', help: 'Declare the symbol.',
        primary: { path: 'lib/a.srp', start: { line: 2, column: 3 },
          end: { line: 2, column: 8 } },
        related: [
          { message: 'Imported here', location: {
            path: 'main.srp', start: { line: 1, column: 1 }, end: { line: 1, column: 4 },
          } },
          { message: 'Additional context', location: null },
        ],
      },
    };
    expect(consoleTranscript(failed, 'check')).toBe(
      'Check failed\nCode: E0010\nLocation: lib/a.srp:2:3\nUnknown identifier\n' +
      'Hint: Declare the symbol.\nRelated: Imported here (main.srp:1:1)\n' +
      'Related: Additional context\n',
    );
  });

  it('never exports forged partial stdout on a failed compiler response', () => {
    const rejected = decodeWorkerResult({
      ok: false, stdout: 'not allowed', stderr: '', error: 'failed',
    });
    expect(consoleTranscript(rejected, 'run')).toBe(
      'Execution failed\nInvalid or oversized response from the Scarp compiler worker.\n',
    );
    expect(consoleTranscript(rejected, 'run')).not.toContain('not allowed');
  });

  it('reports generic failures without attaching the source or input payload', () => {
    const failed: RunResult = { ok: false, stdout: '', stderr: '', error: 'Execution timed out.' };
    expect(consoleTranscript(failed, 'run')).toBe('Execution failed\nExecution timed out.\n');
  });
});

