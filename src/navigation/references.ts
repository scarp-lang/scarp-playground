import { validPath, validateWorkspace, type Workspace } from '../workspace';
import type { CompilerDiagnostic } from '../runner/types';
import { MAX_COMPILER_JSON_CHARS, decodeWorkerResult } from '../runner/protocol';
import { claimCompilerWorker } from '../runner/worker-slot';

export const MAX_REFERENCE_RESULTS = 120;

export type SourceRange = {
  path: string;
  start: { line: number; column: number };
  end: { line: number; column: number };
};
export type ReferenceSite = SourceRange & { kind: string };
export type ReferenceResult =
  | { ok: true; symbol: { name: string; kind: string } | null;
      declaration: SourceRange | null; references: ReferenceSite[]; truncated: boolean }
  | { ok: false; error: string; diagnostic?: CompilerDiagnostic | null };

const failure = (message: string): ReferenceResult => ({ ok: false, error: message });
const invalid = () => failure('Invalid or oversized Find References response from the Scarp compiler.');
const record = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const pos = (v: unknown) => record(v) &&
  Number.isSafeInteger(v.line) && Number(v.line) >= 1 && Number(v.line) <= 65537 &&
  Number.isSafeInteger(v.column) && Number(v.column) >= 1 && Number(v.column) <= 65537;

function range(v: unknown): v is SourceRange {
  if (!record(v) || typeof v.path !== 'string' || !validPath(v.path) ||
      !pos(v.start) || !pos(v.end)) return false;
  const a = v.start as {line: number; column: number};
  const b = v.end as {line: number; column: number};
  return b.line > a.line || (b.line === a.line && b.column >= a.column);
}

export function validatedReferencesResult(value: unknown): ReferenceResult {
  if (!record(value) || typeof value.ok !== 'boolean') return invalid();
  if (!value.ok) {
    const answer = decodeWorkerResult({
      ok: false, stdout: '', stderr: '', error: value.error,
      diagnostic: value.diagnostic,
    });
    if (!answer.error || answer.error.startsWith('Invalid or oversized')) return invalid();
    return { ok: false, error: answer.error, diagnostic: answer.diagnostic };
  }
  if (value.symbol === null && value.declaration === null &&
      Array.isArray(value.references) && value.references.length === 0 &&
      value.truncated === false) {
    return { ok: true, symbol: null, declaration: null, references: [], truncated: false };
  }
  const symbol = value.symbol;
  if (!record(symbol) || typeof symbol.name !== 'string' ||
      symbol.name.length === 0 || symbol.name.length > 256 ||
      typeof symbol.kind !== 'string' || symbol.kind.length > 32 ||
      (value.declaration !== null && !range(value.declaration)) ||
      !Array.isArray(value.references) ||
      value.references.length > MAX_REFERENCE_RESULTS ||
      typeof value.truncated !== 'boolean') return invalid();
  const sites: ReferenceSite[] = [];
  for (const item of value.references) {
    if (!range(item) || !record(item) ||
        typeof item.kind !== 'string' || item.kind.length > 32) return invalid();
    sites.push({
      path: item.path, start: item.start, end: item.end, kind: item.kind,
    });
  }
  return {
    ok: true,
    symbol: { name: symbol.name, kind: symbol.kind },
    declaration: value.declaration as SourceRange | null,
    references: sites,
    truncated: value.truncated,
  };
}

export function decodeReferencesReply(raw: unknown): ReferenceResult {
  if (typeof raw !== 'string' || raw.length > MAX_COMPILER_JSON_CHARS) return invalid();
  try { return validatedReferencesResult(JSON.parse(raw)); }
  catch { return invalid(); }
}

const TIMEOUT_MS = 12_000;
/** Queries the compiled Rust index in an isolated cancellable browser worker. */
export function findReferences(
  workspace: Workspace, path: string, offset: number, signal?: AbortSignal,
): Promise<ReferenceResult> {
  if (signal?.aborted) return Promise.resolve(failure('Reference lookup cancelled.'));
  const problem = validateWorkspace(workspace);
  if (problem) return Promise.resolve(failure(problem));
  if (!validPath(path) || !Object.hasOwn(workspace.files, path) ||
      !Number.isSafeInteger(offset) || offset < 0 ||
      offset > new TextEncoder().encode(workspace.files[path]).byteLength) {
    return Promise.resolve(failure('Invalid reference source or position.'));
  }
  return new Promise(resolve => {
    let worker: Worker | undefined;
    let done = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let release = () => {};
    const complete = (answer: ReferenceResult) => {
      if (done) return;
      done = true;
      if (timer !== undefined) clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      worker?.terminate();
      release();
      resolve(answer);
    };
    const onAbort = () => complete(failure('Reference lookup cancelled.'));
    release = claimCompilerWorker(onAbort);
    try {
      worker = new Worker(new URL('../runner/worker.ts', import.meta.url), { type: 'module' });
    } catch {
      complete(failure('Unable to start Scarp reference lookup worker.'));
      return;
    }
    signal?.addEventListener('abort', onAbort, { once: true });
    if (signal?.aborted) {
      complete(failure('Reference lookup cancelled.'));
      return;
    }
    timer = setTimeout(() => complete(failure('Reference lookup exceeded the 12-second browser limit.')), TIMEOUT_MS);
    worker.onerror = e => {
      e.preventDefault();
      complete(failure('Scarp reference lookup worker failed or crashed.'));
    };
    worker.onmessageerror = () => complete(failure('Unreadable reference lookup worker reply.'));
    worker.onmessage = (event: MessageEvent<{
      id: number; references: ReferenceResult;
    }>) => {
      if (event.data?.id === 1) complete(validatedReferencesResult(event.data.references));
    };
    try {
      worker.postMessage({ id: 1, workspace, mode: 'references', path, offset });
    } catch {
      complete(failure('Unable to send source to the Scarp reference lookup worker.'));
    }
  });
}
