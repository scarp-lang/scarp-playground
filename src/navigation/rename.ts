import { validPath, validateWorkspace, type Workspace } from '../workspace';
import type { CompilerDiagnostic } from '../runner/types';
import { MAX_COMPILER_JSON_CHARS, decodeWorkerResult } from '../runner/protocol';
import { claimCompilerWorker } from '../runner/worker-slot';

export const MAX_RENAME_SITES = 120;
export const MAX_RENAME_NAME_LENGTH = 64;

/** File-local UTF-8 byte spans emitted by the resolved Rust symbol index. */
export type RenameEdit = { path: string; start: number; end: number };

export type RenameResult =
  | { ok: true; old_name: string; new_name: string; kind: string;
      changes: number; changed_files: string[]; edits: RenameEdit[]; files: Record<string, string> }
  | { ok: false; error: string; diagnostic?: CompilerDiagnostic | null };

const invalid = (): RenameResult =>
  ({ ok: false, error: 'Invalid or oversized rename response from the Scarp compiler.' });
const failed = (error: string): RenameResult => ({ ok: false, error });
const record = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

export function validRenameName(name: string): boolean {
  return /^[A-Za-z_][A-Za-z_0-9]{0,63}$/.test(name);
}

/** Treat WASM worker responses as untrusted until bounded and shape-checked. */
export function validatedRenameResult(value: unknown): RenameResult {
  if (!record(value) || typeof value.ok !== 'boolean') return invalid();
  if (!value.ok) {
    const result = decodeWorkerResult({
      ok: false, stdout: '', stderr: '', error: value.error,
      diagnostic: value.diagnostic,
    });
    if (!result.error || result.error.startsWith('Invalid or oversized')) return invalid();
    return { ok: false, error: result.error, diagnostic: result.diagnostic };
  }
  if (typeof value.old_name !== 'string' || !validRenameName(value.old_name) ||
      typeof value.new_name !== 'string' || !validRenameName(value.new_name) ||
      value.old_name === value.new_name ||
      typeof value.kind !== 'string' || !/^[a-z_]{1,32}$/.test(value.kind) ||
      !Number.isSafeInteger(value.changes) || Number(value.changes) < 1 ||
      Number(value.changes) > MAX_RENAME_SITES ||
      !Array.isArray(value.changed_files) ||
      value.changed_files.length < 1 || value.changed_files.length > 12 ||
      !Array.isArray(value.edits) ||
      value.edits.length !== value.changes ||
      !record(value.files)) return invalid();

  const files = value.files;
  const filePaths = Object.keys(files);
  const changed = value.changed_files;
  if (filePaths.length < 1 || filePaths.length > 12 ||
      filePaths.some(path => !validPath(path) || typeof files[path] !== 'string') ||
      changed.some(path => typeof path !== 'string' || !validPath(path) ||
        !Object.hasOwn(files, path)) ||
      new Set(changed).size !== changed.length ||
      validateWorkspace({ entry: filePaths[0], files: files as Record<string, string> }) !== null) {
    // The fallback entry is a known filename, just for source/path/byte validation.
    return invalid();
  }
  const edits: RenameEdit[] = [];
  for (const candidate of value.edits) {
    if (!record(candidate) || typeof candidate.path !== 'string' ||
        !validPath(candidate.path) ||
        !Number.isSafeInteger(candidate.start) || Number(candidate.start) < 0 ||
        !Number.isSafeInteger(candidate.end) || Number(candidate.end) <= Number(candidate.start) ||
        Number(candidate.end) - Number(candidate.start) !== value.old_name.length ||
        Number(candidate.end) > 64 * 1024) return invalid();
    edits.push({
      path: candidate.path, start: candidate.start as number, end: candidate.end as number,
    });
  }
  return {
    ok: true,
    old_name: value.old_name,
    new_name: value.new_name,
    kind: value.kind,
    changes: value.changes as number,
    changed_files: changed as string[],
    edits,
    files: files as Record<string, string>,
  };
}

/**
 * Independently replay every compiler-provided UTF-8 edit against the exact
 * request snapshot. Reject extra source changes, missing sites, overlapping
 * replacements, invalid Unicode boundaries or altered file membership.
 */
export function verifyRenameSnapshot(
  original: Workspace, requested: string, answer: RenameResult,
): RenameResult {
  if (!answer.ok) return answer;
  if (requested !== answer.new_name || validateWorkspace(original)) return invalid();
  const oldPaths = Object.keys(original.files).sort();
  const newPaths = Object.keys(answer.files).sort();
  if (oldPaths.length !== newPaths.length ||
      oldPaths.some((path, i) => path !== newPaths[i]) ||
      answer.edits.length !== answer.changes) return invalid();

  const editsByPath = new Map<string, RenameEdit[]>();
  for (const edit of answer.edits) {
    if (!Object.hasOwn(original.files, edit.path)) return invalid();
    const sites = editsByPath.get(edit.path) ?? [];
    sites.push(edit);
    editsByPath.set(edit.path, sites);
  }
  const modified = [...editsByPath.keys()].sort();
  if (modified.length !== answer.changed_files.length ||
      modified.some((path, i) => path !== [...answer.changed_files].sort()[i])) return invalid();

  const encoder = new TextEncoder();
  const decoder = new TextDecoder('utf-8', { fatal: true });
  const identifierByte = (byte: number | undefined): boolean =>
    byte !== undefined && ((byte >= 48 && byte <= 57) ||
    (byte >= 65 && byte <= 90) || (byte >= 97 && byte <= 122) || byte === 95);
  try {
    for (const path of oldPaths) {
      const source = original.files[path];
      const expected = answer.files[path];
      const edits = (editsByPath.get(path) ?? []).sort((a, b) => a.start - b.start);
      const bytes = encoder.encode(source);
      let cursor = 0;
      let reconstructed = '';
      for (const edit of edits) {
        if (edit.start < cursor || edit.end > bytes.length ||
            edit.end - edit.start !== answer.old_name.length ||
            identifierByte(bytes[edit.start - 1]) || identifierByte(bytes[edit.end])) {
          return invalid();
        }
        // Fatal decoding refuses spans that split UTF-8 characters.
        reconstructed += decoder.decode(bytes.subarray(cursor, edit.start));
        if (decoder.decode(bytes.subarray(edit.start, edit.end)) !== answer.old_name) {
          return invalid();
        }
        reconstructed += answer.new_name;
        cursor = edit.end;
      }
      reconstructed += decoder.decode(bytes.subarray(cursor));
      if (reconstructed !== expected) return invalid();
    }
  } catch {
    return invalid();
  }
  return answer;
}

export function decodeRenameReply(raw: unknown): RenameResult {
  if (typeof raw !== 'string' || raw.length > MAX_COMPILER_JSON_CHARS) return invalid();
  try { return validatedRenameResult(JSON.parse(raw)); }
  catch { return invalid(); }
}

const TIMEOUT_MS = 12_000;

/** A one-shot compile-only rename preview; the user must explicitly apply it. */
export function previewSymbolRename(
  workspace: Workspace, path: string, offset: number, newName: string,
  signal?: AbortSignal,
): Promise<RenameResult> {
  if (signal?.aborted) return Promise.resolve(failed('Rename cancelled.'));
  const problem = validateWorkspace(workspace);
  if (problem) return Promise.resolve(failed(problem));
  if (!validRenameName(newName)) {
    return Promise.resolve(failed('Use 1–64 ASCII letters, digits or underscores, starting with a letter or underscore.'));
  }
  if (!validPath(path) || !Object.hasOwn(workspace.files, path) ||
      !Number.isSafeInteger(offset) || offset < 0 ||
      offset >= new TextEncoder().encode(workspace.files[path]).byteLength) {
    return Promise.resolve(failed('Invalid rename source or position.'));
  }
  return new Promise(resolve => {
    let worker: Worker | undefined;
    let done = false;
    const timer: { deadline?: ReturnType<typeof setTimeout> } = {};
    let release = () => {};
    const complete = (answer: RenameResult) => {
      if (done) return;
      done = true;
      if (timer.deadline !== undefined) clearTimeout(timer.deadline);
      signal?.removeEventListener('abort', onAbort);
      worker?.terminate();
      release();
      resolve(verifyRenameSnapshot(workspace, newName, answer));
    };
    const onAbort = () => complete(failed('Rename cancelled.'));
    release = claimCompilerWorker(onAbort);
    try {
      worker = new Worker(new URL('../runner/worker.ts', import.meta.url), { type: 'module' });
    } catch {
      complete(failed('Unable to start the Scarp rename worker.'));
      return;
    }
    signal?.addEventListener('abort', onAbort, { once: true });
    if (signal?.aborted) {
      complete(failed('Rename cancelled.'));
      return;
    }
    timer.deadline = setTimeout(() =>
      complete(failed('Rename exceeded the 12-second browser limit.')), TIMEOUT_MS);
    worker.onerror = event => {
      event.preventDefault();
      complete(failed('The Scarp rename worker failed or crashed.'));
    };
    worker.onmessageerror = () => complete(failed('Unreadable Scarp rename worker reply.'));
    worker.onmessage = (event: MessageEvent<{ id: number; rename: RenameResult }>) => {
      if (event.data?.id === 1) complete(validatedRenameResult(event.data.rename));
    };
    try {
      worker.postMessage({
        id: 1, workspace, mode: 'rename', path, offset, new_name: newName,
      });
    } catch {
      complete(failed('Unable to send source to the rename worker.'));
    }
  });
}
