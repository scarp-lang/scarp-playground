import {
  MAX_FILE_BYTES, MAX_FILES, MAX_TOTAL_BYTES, validPath, validateWorkspace,
  type Workspace,
} from './workspace';

/** Bytes are read from explicit local file-picker selections, never network URLs. */
export type SourceUpload = { path: string; bytes: Uint8Array };

export type SourceImportPlan =
  | { ok: true; workspace: Workspace; addedPaths: string[] }
  | { ok: false; error: string };

/**
 * Preview an atomic, add-only source import. Rejections never mutate the live
 * workspace or insert half of a selected batch. Files are decoded as strict
 * UTF-8, preserving Unicode and original line endings; UTF-8 BOMs are removed.
 */
export function previewSourceImport(
  workspace: Workspace,
  uploads: readonly SourceUpload[],
): SourceImportPlan {
  if (validateWorkspace(workspace)) {
    return { ok: false, error: 'Fix the current workspace before importing new files.' };
  }
  if (!uploads.length) return { ok: false, error: 'Select at least one .srp file.' };
  if (Object.keys(workspace.files).length + uploads.length > MAX_FILES) {
    return { ok: false, error: 'Import would exceed the ' + MAX_FILES + '-file workspace limit.' };
  }

  const files: Record<string, string> = Object.assign(Object.create(null), workspace.files);
  const encoder = new TextEncoder();
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let totalBytes = Object.values(workspace.files).reduce(
    (sum, source) => sum + encoder.encode(source).byteLength, 0,
  );
  const addedPaths: string[] = [];

  for (const upload of uploads) {
    if (!validPath(upload.path)) {
      return { ok: false, error: 'Invalid .srp filename: ' + String(upload.path).slice(0, 128) };
    }
    if (Object.hasOwn(files, upload.path)) {
      return { ok: false, error: upload.path + ' already exists. No files were imported.' };
    }
    if (!(upload.bytes instanceof Uint8Array)) {
      return { ok: false, error: 'Unable to read ' + upload.path + ' as bytes.' };
    }
    if (upload.bytes.byteLength > MAX_FILE_BYTES) {
      return { ok: false, error: upload.path + ' exceeds the 64 KiB source limit.' };
    }
    totalBytes += upload.bytes.byteLength;
    if (totalBytes > MAX_TOTAL_BYTES) {
      return { ok: false, error: 'Import would exceed the 128 KiB total source limit.' };
    }

    let source: string;
    try {
      source = decoder.decode(upload.bytes);
    } catch {
      return { ok: false, error: upload.path + ' is not valid UTF-8 text.' };
    }
    files[upload.path] = source;
    addedPaths.push(upload.path);
  }

  const next: Workspace = { entry: workspace.entry, files };
  const problem = validateWorkspace(next);
  if (problem) return { ok: false, error: problem };
  return { ok: true, workspace: next, addedPaths };
}
