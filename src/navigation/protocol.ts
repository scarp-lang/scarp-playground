import { MAX_COMPILER_JSON_CHARS, decodeWorkerResult } from '../runner/protocol';
import { validPath } from '../workspace';
import type { CompilerDiagnostic, DiagnosticPosition } from '../runner/types';

export type DefinitionTarget = {
  path: string;
  start: DiagnosticPosition;
  end: DiagnosticPosition;
};

export type DefinitionResult = {
  ok: boolean;
  target?: DefinitionTarget | null;
  error?: string;
  diagnostic?: CompilerDiagnostic | null;
};

const errorResult = (): DefinitionResult => ({
  ok: false, error: 'Invalid or oversized definition response from the Scarp compiler.',
});

const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function position(value: unknown): value is DiagnosticPosition {
  return record(value) && Number.isSafeInteger(value.line) &&
    Number(value.line) >= 1 && Number.valueOf(value.line) <= 65537 &&
    Number.isSafeInteger(value.column) && Number(value.column) >= 1 &&
    Number(value.column) <= 65537;
}

/** Accept only bounded, well-formed compiler navigation replies. */
export function validatedDefinitionResult(value: unknown): DefinitionResult {
  if (!record(value) || typeof value.ok !== 'boolean') return errorResult();
  if (!value.ok) {
    const decoded = decodeWorkerResult({
      ok: false, stdout: '', stderr: '', error: value.error, diagnostic: value.diagnostic,
    });
    if (!decoded.error || decoded.error.startsWith('Invalid or oversized response')) return errorResult();
    return { ok: false, error: decoded.error, diagnostic: decoded.diagnostic };
  }
  if (value.target === null) return { ok: true, target: null };
  if (!record(value.target) || !validPath(value.target.path) ||
      !position(value.target.start) || !position(value.target.end)) return errorResult();
  const target = value.target;
  if (Number(target.end.line) < Number(target.start.line) ||
      (target.end.line === target.start.line &&
       Number(target.end.column) < Number(target.start.column))) return errorResult();
  return { ok: true, target: { path: target.path, start: target.start, end: target.end } };
}

export function decodeDefinitionReply(raw: unknown): DefinitionResult {
  if (typeof raw !== 'string' || raw.length > MAX_COMPILER_JSON_CHARS) return errorResult();
  try {
    return validatedDefinitionResult(JSON.parse(raw));
  } catch {
    return errorResult();
  }
}
