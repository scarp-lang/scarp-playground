import { validPath, validateWorkspace, type Workspace } from '../workspace';
import { MAX_PROGRAM_INPUT_BYTES } from './limits';
import { isUtf8Text } from '../utf8';
import type {
  RunRequest, RunResponse, DefinitionRequest, DefinitionResponse,
  ReferencesRequest, ReferencesResponse, RenameRequest, RenameResponse, OutlineRequest, OutlineResponse, InspectionRequest, InspectionResponse,
} from './types';
import { validRenameName } from '../navigation/rename';

export type CompilerWorkerRequest =
  RunRequest | DefinitionRequest | ReferencesRequest | RenameRequest | OutlineRequest | InspectionRequest;
export type CompilerWorkerResponse =
  RunResponse | DefinitionResponse | ReferencesResponse | RenameResponse | OutlineResponse | InspectionResponse;

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
  // Construct a fresh payload instead of forwarding the incoming object.
  // A structurally valid workspace can still contain arbitrary extra keys,
  // including stdin, allowPrompts or a cyclic object. Only source and entry
  // belong in the JSON sent to the bridge.
  const candidate = value.workspace as Workspace;
  const workspace: Workspace = {
    entry: candidate.entry,
    files: Object.fromEntries(Object.entries(candidate.files)),
  };
  if (value.mode === 'run') {
    if (value.allowPrompts !== undefined && typeof value.allowPrompts !== 'boolean') return null;
    if (value.stdin !== undefined && typeof value.stdin !== 'string') return null;
    if (typeof value.stdin === 'string' &&
        !isUtf8Text(value.stdin, MAX_PROGRAM_INPUT_BYTES)) return null;
    return {
      id: 1, workspace, mode: 'run',
      ...(typeof value.stdin === 'string' ? { stdin: value.stdin } : {}),
      ...(typeof value.allowPrompts === 'boolean' ? { allowPrompts: value.allowPrompts } : {}),
    };
  }
  if (value.mode === 'check' || value.mode === 'verify') {
    // Input belongs to Run only, even when present with an empty value.
    return Object.hasOwn(value, 'stdin') || Object.hasOwn(value, 'allowPrompts')
      ? null : { id: 1, workspace, mode: value.mode };
  }

  if (value.mode === 'inspect') {
    if (['stdin', 'allowPrompts', 'path', 'offset', 'new_name'].some(key => Object.hasOwn(value, key))) return null;
    return { id: 1, workspace, mode: 'inspect' };
  }
  if (value.mode === 'outline') {
    if (!validPath(value.path) || !Object.hasOwn(workspace.files, value.path) ||
        Object.hasOwn(value, 'stdin') || Object.hasOwn(value, 'allowPrompts') ||
        Object.hasOwn(value, 'offset') || Object.hasOwn(value, 'new_name')) return null;
    return { id: 1, workspace, mode: 'outline', path: value.path };
  }

  if (value.mode !== 'definition' && value.mode !== 'references' &&
      value.mode !== 'rename') return null;
  if (!validPath(value.path) || !Object.hasOwn(workspace.files, value.path) ||
      !Number.isSafeInteger(value.offset) || (value.offset as number) < 0) return null;
  const encodedSource = new TextEncoder().encode(workspace.files[value.path]);
  const byteLength = encodedSource.byteLength;
  const byteOffset = value.offset as number;
  if (byteOffset > byteLength ||
      // UTF-8 continuation bytes cannot begin a Unicode scalar. A forged
      // navigation/rename offset inside one must never reach the Rust bridge.
      (byteOffset < byteLength && (encodedSource[byteOffset] & 0xc0) === 0x80)) {
    return null;
  }
  // Navigation and Rename are strictly input-free and never acquire prompt
  // capabilities. Reject before the Rename early-return path as well.
  if (Object.hasOwn(value, 'stdin') || Object.hasOwn(value, 'allowPrompts')) return null;
  if (value.mode === 'rename') {
    if ((value.offset as number) === byteLength || typeof value.new_name !== 'string' ||
        !validRenameName(value.new_name)) return null;
    return {
      id: 1, workspace, mode: 'rename', path: value.path,
      offset: value.offset as number, new_name: value.new_name,
    };
  }
  // Definition/References cannot carry Rename's mutation payload.
  if (Object.hasOwn(value, 'new_name')) return null;
  return {
    id: 1, workspace, mode: value.mode, path: value.path, offset: value.offset as number,
  };
}

/** Give clients an immediate, shape-correct rejection instead of a timeout. */
export function rejectedCompilerWorkerRequest(value: unknown): CompilerWorkerResponse | null {
  if (!record(value) || value.id !== 1) return null;
  const error = 'Invalid Scarp compiler worker request.';
  if (value.mode === 'inspect') return { id: 1, inspection: { ok: false, error } };
  if (value.mode === 'outline') return { id: 1, outline: { ok: false, error } };
  if (value.mode === 'definition') return { id: 1, definition: { ok: false, error } };
  if (value.mode === 'references') return { id: 1, references: { ok: false, error } };
  if (value.mode === 'rename') return { id: 1, rename: { ok: false, error } };
  return { id: 1, result: { ok: false, stdout: '', stderr: '', error } };
}
