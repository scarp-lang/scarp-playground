import { createBulkEditUndo, type BulkEditUndo } from './bulk-undo';
import { sourceArchiveProblem } from './source-archive';
import { MAX_FILES, MAX_FILE_BYTES, validPath, validateWorkspace, type Workspace } from './workspace';
import { isUtf8Text } from './utf8';

export const MAX_SCAFFOLD_REQUESTS = 4;
export const MAX_SCAFFOLD_PREVIEW_CHARS = 180;
export type ScaffoldKind = 'empty' | 'comment' | 'clone' | 'custom';
export type ScaffoldRequest = Readonly<{
  path: string;
  kind: ScaffoldKind;
  from?: string;
  content?: string;
}>;
export type ScaffoldFile = Readonly<{
  path: string;
  kind: ScaffoldKind;
  bytes: number;
  lines: number;
  preview: string;
  previewTruncated: boolean;
  from: string | null;
  caution: string | null;
}>;
export type ScaffoldPlan =
  | { ok: true; workspace: Workspace; added: ScaffoldFile[];
      totalNewBytes: number; existingFiles: number; remainingSlots: number }
  | { ok: false; error: string };

const fail = (error: string): ScaffoldPlan => ({ ok: false, error });

function previewText(value: string): { preview: string; previewTruncated: boolean } {
  if (value.length <= MAX_SCAFFOLD_PREVIEW_CHARS) {
    return { preview: value, previewTruncated: false };
  }
  let end = MAX_SCAFFOLD_PREVIEW_CHARS;
  const code = value.charCodeAt(end - 1);
  if (code >= 0xd800 && code <= 0xdbff) end--;
  return { preview: value.slice(0, end) + '…', previewTruncated: true };
}

function contentFor(
  workspace: Workspace, request: ScaffoldRequest,
): { text: string; caution: string | null } | null {
  if (!request || !validPath(request.path)) return null;
  switch (request.kind) {
    case 'empty':
      return { text: '', caution: null };
    case 'comment':
      return {
        text: '// Scarp module: ' + request.path + '\n',
        caution: 'Comment-only file. Add actual Scarp declarations before importing it.',
      };
    case 'clone':
      if (!validPath(request.from) ||
          !Object.hasOwn(workspace.files, request.from)) return null;
      return {
        text: workspace.files[request.from],
        caution: 'Copied source may contain relative imports that resolve differently at this path.',
      };
    case 'custom':
      if (typeof request.content !== 'string' ||
          !isUtf8Text(request.content, MAX_FILE_BYTES)) return null;
      return {
        text: request.content,
        caution: 'Custom text was not parsed or type-checked by the Scarp compiler.',
      };
    default:
      return null;
  }
}

/**
 * Add-only, atomic local file scaffold. Every source is validated against
 * the same worker limits, and the complete projected workspace is checked
 * for portability. No existing file, entrypoint, stdin or runtime state
 * can be modified by a scaffold preview.
 */
export function previewBatchScaffold(
  workspace: Workspace, requests: readonly ScaffoldRequest[],
): ScaffoldPlan {
  const problem = validateWorkspace(workspace);
  if (problem) return fail(problem);
  if (!Array.isArray(requests) || requests.length < 1 ||
      requests.length > MAX_SCAFFOLD_REQUESTS ||
      Object.keys(workspace.files).length + requests.length > MAX_FILES) {
    return fail('Add between one and four new files without exceeding the 12-file workspace quota.');
  }
  const seen = new Set<string>();
  const files: Record<string, string> = { ...workspace.files };
  const added: ScaffoldFile[] = [];
  const encoder = new TextEncoder();
  let totalNewBytes = 0;
  for (const raw of requests) {
    const request = raw as ScaffoldRequest;
    if (!request || !validPath(request.path) ||
        Object.hasOwn(files, request.path) ||
        seen.has(request.path.toLowerCase())) {
      return fail('The scaffold contains a duplicate, existing, or invalid relative .srp path.');
    }
    const generated = contentFor(workspace, request);
    if (!generated) return fail('A scaffold template or source file is invalid.');
    const bytes = encoder.encode(generated.text).byteLength;
    if (bytes > MAX_FILE_BYTES) return fail('The generated source exceeds 64 KiB.');
    files[request.path] = generated.text;
    seen.add(request.path.toLowerCase());
    totalNewBytes += bytes;
    added.push({
      path: request.path, kind: request.kind, bytes,
      lines: generated.text.split(/\r\n|\r|\n/).length,
      ...previewText(generated.text),
      from: request.kind === 'clone' ? request.from! : null,
      caution: generated.caution,
    });
  }
  const projected: Workspace = { entry: workspace.entry, files };
  const failure = validateWorkspace(projected);
  if (failure) return fail('The generated project exceeds Scarp limits: ' + failure);
  const portability = sourceArchiveProblem(projected);
  if (portability) return fail('The generated path is not portable: ' + portability);
  for (const path of Object.keys(workspace.files)) {
    if (projected.files[path] !== workspace.files[path]) {
      return fail('A scaffold cannot overwrite existing sources.');
    }
  }
  return {
    ok: true, workspace: projected, added,
    totalNewBytes, existingFiles: Object.keys(workspace.files).length,
    remainingSlots: MAX_FILES - Object.keys(projected.files).length,
  };
}

/** Recompute every generated byte before allowing one-step batch undo. */
export function verifiedScaffoldUndo(
  original: Workspace, requests: readonly ScaffoldRequest[], plan: ScaffoldPlan,
): BulkEditUndo | null {
  if (!plan.ok || validateWorkspace(original)) return null;
  const replay = previewBatchScaffold(original, requests);
  if (!replay.ok || replay.workspace.entry !== plan.workspace.entry) return null;
  const keys = Object.keys(replay.workspace.files).sort();
  const proposed = Object.keys(plan.workspace.files).sort();
  if (keys.length !== proposed.length ||
      keys.some((path, index) => path !== proposed[index] ||
        replay.workspace.files[path] !== plan.workspace.files[path])) return null;
  return createBulkEditUndo(original, plan.workspace, 'source import');
}
