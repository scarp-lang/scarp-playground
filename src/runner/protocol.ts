import type { CompilerDiagnostic, DiagnosticLocation, RunResult } from './types';

/** Independent browser-side ceilings for replies from the native WASM bridge. */
export const MAX_COMPILER_JSON_CHARS = 8 * 1024 * 1024;
export const MAX_OUTPUT_BYTES = 1024 * 1024;
export const MAX_DIAGNOSTIC_BYTES = 128 * 1024;

const encoder = new TextEncoder();
const protocolFailure = (): RunResult => ({
  ok: false,
  stdout: '',
  stderr: '',
  error: 'Invalid or oversized response from the Scarp compiler worker.',
});

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function boundedText(value: unknown, limit: number): value is string {
  return typeof value === 'string' &&
    value.length <= limit &&
    encoder.encode(value).byteLength <= limit;
}

function position(value: unknown): value is { line: number; column: number } {
  return record(value) &&
    Number.isSafeInteger(value.line) && Number(value.line) >= 1 &&
    Number.isSafeInteger(value.column) && Number(value.column) >= 1;
}

function location(value: unknown): value is DiagnosticLocation {
  if (!record(value) || !boundedText(value.path, 128) || !position(value.start) ||
      !position(value.end)) return false;
  if (value.span !== undefined &&
      (!Array.isArray(value.span) || value.span.length !== 2 ||
       !value.span.every((n: unknown) => Number.isSafeInteger(n) && Number(n) >= 0) ||
       value.span[0] > value.span[1])) return false;
  return true;
}

function diagnostic(value: unknown): value is CompilerDiagnostic {
  if (!record(value) ||
      value.schema_version !== 1 || value.severity !== 'error' ||
      (value.code !== null && !boundedText(value.code, 128)) ||
      !boundedText(value.message, MAX_DIAGNOSTIC_BYTES) ||
      value.span_encoding !== 'utf-8-bytes' ||
      value.column_encoding !== 'unicode-scalar' ||
      value.position_base !== 1 ||
      (value.help !== undefined && value.help !== null &&
       !boundedText(value.help, MAX_DIAGNOSTIC_BYTES)) ||
      (value.primary !== undefined && value.primary !== null && !location(value.primary))) {
    return false;
  }
  if (value.related !== undefined) {
    if (!Array.isArray(value.related) || value.related.length > 64) return false;
    for (const note of value.related) {
      if (!record(note) || !boundedText(note.message, 4096) ||
          (note.location !== null && !location(note.location))) return false;
    }
  }
  return true;
}

/** Only validated, bounded responses may enter React/Monaco as compiler output. */
export function validatedRunResult(value: unknown): RunResult | null {
  if (!record(value) || typeof value.ok !== 'boolean' ||
      !boundedText(value.stdout, MAX_OUTPUT_BYTES) ||
      !boundedText(value.stderr, MAX_OUTPUT_BYTES) ||
      encoder.encode(value.stdout).byteLength + encoder.encode(value.stderr).byteLength >
        MAX_OUTPUT_BYTES ||
      (value.error !== undefined && !boundedText(value.error, MAX_DIAGNOSTIC_BYTES)) ||
      (value.diagnostic !== undefined && value.diagnostic !== null &&
       !diagnostic(value.diagnostic))) {
    return null;
  }
  return value as RunResult;
}

/** Reject oversized compiler text *before* JSON.parse allocates a response tree. */
export function decodeCompilerReply(raw: unknown): RunResult {
  if (typeof raw !== 'string' || raw.length > MAX_COMPILER_JSON_CHARS) {
    return protocolFailure();
  }
  try {
    return validatedRunResult(JSON.parse(raw)) ?? protocolFailure();
  } catch {
    return protocolFailure();
  }
}

export function decodeWorkerResult(value: unknown): RunResult {
  return validatedRunResult(value) ?? protocolFailure();
}
