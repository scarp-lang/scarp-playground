import {
  MAX_FILES, MAX_FILE_BYTES, MAX_TOTAL_BYTES, validPath, validateWorkspace, type Workspace,
} from './workspace';
import type { SourceUpload } from './source-import';

// Bound metadata inspection before reading any selected file contents.
export const MAX_FOLDER_SELECTION_ENTRIES = 2048;
const MAX_RELATIVE_PICKER_PATH = 512;

export type FolderSelectionEntry = {
  name: string;
  webkitRelativePath: string;
  size: number;
};

type FolderCandidate = { index: number; path: string; size: number };
export type FolderSelectionPlan =
  | { ok: true; candidates: FolderCandidate[]; ignored: number; totalBytes: number }
  | { ok: false; error: string };

export type SourceFolderPlan =
  | { ok: true; workspace: Workspace }
  | { ok: false; error: string };

function fail(error: string): { ok: false; error: string } {
  return { ok: false, error };
}

/**
 * Inspect only directory-picker metadata. Strip one selected root segment,
 * preserve nested source paths, ignore non-.srp files without reading them,
 * and reject the whole selection if any source cannot be represented safely.
 */
export function planFolderSelection(entries: readonly FolderSelectionEntry[]): FolderSelectionPlan {
  if (!entries.length) return fail('Choose a folder containing .srp files.');
  if (entries.length > MAX_FOLDER_SELECTION_ENTRIES) {
    return fail('Choose a smaller source folder (at most 2,048 selected file entries).');
  }
  const candidates: FolderCandidate[] = [];
  const paths = new Set<string>();
  let root: string | null = null;
  let ignored = 0;
  let totalBytes = 0;

  for (const [index, entry] of entries.entries()) {
    if (!entry.name.endsWith('.srp')) { ignored++; continue; }
    const pickerPath = entry.webkitRelativePath;
    if (typeof pickerPath !== 'string' || !pickerPath ||
        pickerPath.length > MAX_RELATIVE_PICKER_PATH ||
        pickerPath.includes('\\') || pickerPath.startsWith('/') ||
        Array.from(pickerPath).some(char => char.charCodeAt(0) <= 31 || char.charCodeAt(0) === 127)) {
      return fail('The directory picker did not supply a safe relative source path.');
    }
    const segments = pickerPath.split('/');
    const selectedRoot = segments.shift();
    if (!selectedRoot || selectedRoot === '.' || selectedRoot === '..' || selectedRoot.includes(':') ||
        segments.at(-1) !== entry.name) {
      return fail('The selected folder contains an inconsistent relative source path.');
    }
    if (root !== null && root !== selectedRoot) {
      return fail('Select a single folder rather than multiple directory roots.');
    }
    root = selectedRoot;
    const path = segments.join('/');
    if (!validPath(path)) {
      return fail('Invalid relative .srp path: ' + String(path).slice(0, 128));
    }
    if (paths.has(path)) return fail('Duplicate source path: ' + path);
    if (!Number.isSafeInteger(entry.size) || entry.size < 0 || entry.size > MAX_FILE_BYTES) {
      return fail(path + ' exceeds the 64 KiB source limit or has an invalid file size.');
    }
    if (candidates.length === MAX_FILES) return fail('A workspace supports at most 12 .srp files.');
    totalBytes += entry.size;
    if (totalBytes > MAX_TOTAL_BYTES) return fail('Folder sources exceed the 128 KiB total limit.');
    paths.add(path);
    candidates.push({ index, path, size: entry.size });
  }
  if (!candidates.length) return fail('The selected folder contains no lowercase .srp files.');
  candidates.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
  return { ok: true, candidates, ignored, totalBytes };
}

/** Construct a fresh source-only workspace from the exact preflight selection. */
export function decodeSourceFolder(
  selection: Extract<FolderSelectionPlan, { ok: true }>,
  uploads: readonly SourceUpload[],
): SourceFolderPlan {
  if (uploads.length !== selection.candidates.length || !uploads.length || uploads.length > MAX_FILES) {
    return fail('The selected folder changed while it was being read.');
  }
  const files: Record<string, string> = Object.create(null);
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let totalBytes = 0;
  for (const [index, upload] of uploads.entries()) {
    const expected = selection.candidates[index];
    if (!validPath(upload.path) || upload.path !== expected.path ||
        Object.hasOwn(files, upload.path) || !(upload.bytes instanceof Uint8Array) ||
        upload.bytes.byteLength !== expected.size || upload.bytes.byteLength > MAX_FILE_BYTES) {
      return fail('The selected source files changed or could not be read safely.');
    }
    totalBytes += upload.bytes.byteLength;
    if (totalBytes > MAX_TOTAL_BYTES) return fail('Folder sources exceed the 128 KiB total limit.');
    try {
      // Match ordinary source import: optional UTF-8 BOM stripped, line endings kept.
      files[upload.path] = decoder.decode(upload.bytes);
    } catch {
      return fail(upload.path + ' is not valid UTF-8 text.');
    }
  }
  if (totalBytes !== selection.totalBytes) return fail('The selected folder byte count changed.');
  const paths = Object.keys(files).sort();
  const entry = Object.hasOwn(files, 'main.srp') ? 'main.srp'
    : Object.hasOwn(files, 'src/main.srp') ? 'src/main.srp' : paths[0];
  const workspace = { entry, files };
  const failure = validateWorkspace(workspace);
  return failure ? fail(failure) : { ok: true, workspace };
}
