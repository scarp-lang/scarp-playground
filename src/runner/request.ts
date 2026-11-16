import { validPath, validateWorkspace, type Workspace } from '../workspace';
import { MAX_PROGRAM_INPUT_BYTES } from './limits';
import type {
  RunRequest, RunResponse, DefinitionRequest, DefinitionResponse,
  ReferencesRequest, ReferencesResponse, RenameRequest, RenameResponse,
} from './types';
import { validRenameName } from '../navigation/rename';

export type CompilerWorkerRequest =
  RunRequest | DefinitionRequest | ReferencesRequest | RenameRequest;
export type CompilerWorkerResponse =
  RunResponse | DefinitionResponse | ReferencesResponse | RenameResponse;

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Workers accept only a single validated request sent by the Playground.
 * Treat structured-cloned values as untrusted, not just their TypeScript type.
 * No malformed request should initialize or invoke the WebAssembly compiler.
 */
export function validatedCompilerWorkerRequest(value: unknown): CompilerWorkerRequest | null {
  if (!record(value) || value.id !== 1 || validateWorkspace(value.workspace)) return null;
  const workspace = value.workspace as Workspace;
  if (value.mode === 'run') {
    if (value.stdin !== undefined && typeof value.stdin !== 'string') return null;
    if (typeof value.stdin === 'string' &&
        new TextEncoder().encode(value.stdin).byteLength > MAX_PROGRAM_INPUT_BYTES) return null;
    return value as RunRequest;
  }
  if (value.mode === 'check' || value.mode === 'verify') {
    // Input belongs to Run only, even when present with an empty value.
    return Object.hasOwn(value, 'stdin') ? null : value as RunRequest;
  }

  if (value.mode !== 'definition' && value.mode !== 'references' &&
      value.mode !== 'rename') return null;
  if (!validPath(value.path) || !Object.hasOwn(workspace.files, value.path) ||
      !Number.isSafeInteger(value.offset) || (value.offset as number) < 0) return null;
  const byteLength = new TextEncoder().encode(workspace.files[value.path]).byteLength;
  if ((value.offset as number) > byteLength) return null;
  if (value.mode === 'rename') {
    if ((value.offset as number) === byteLength || typeof value.new_name !== 'string' ||
        !validRenameName(value.new_name)) return null;
    return value as RenameRequest;
  }
  // Navigation requests never carry buffered stdin or rename mutations.
  if (Object.hasOwn(value, 'stdin') || Object.hasOwn(value, 'new_name')) return null;
  return value as DefinitionRequest | ReferencesRequest;
}

/** Give clients an immediate, shape-correct rejection instead of a timeout. */
export function rejectedCompilerWorkerRequest(value: unknown): CompilerWorkerResponse | null {
  if (!record(value) || value.id !== 1) return null;
  const error = 'Invalid Scarp compiler worker request.';
  if (value.mode === 'definition') return { id: 1, definition: { ok: false, error } };
  if (value.mode === 'references') return { id: 1, references: { ok: false, error } };
  if (value.mode === 'rename') return { id: 1, rename: { ok: false, error } };
  return { id: 1, result: { ok: false, stdout: '', stderr: '', error } };
}
