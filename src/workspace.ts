export const MAX_FILES = 12;
export const MAX_FILE_BYTES = 64 * 1024;
export const MAX_TOTAL_BYTES = 128 * 1024;
export const MAX_SHARE_BYTES = 2000;

export type Workspace = { entry: string; files: Record<string, string> };

export function validPath(path: string): boolean {
  return /^(?!\.)(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_-]+\.srp$/.test(path) && path.length <= 128;
}

export function validateWorkspace(workspace: Workspace): string | null {
  const entries = Object.entries(workspace.files);
  if (!validPath(workspace.entry) || !Object.hasOwn(workspace.files, workspace.entry)) {
    return 'The selected entry must be an existing .srp file.';
  }
  if (entries.length === 0 || entries.length > MAX_FILES) {
    return 'A workspace must contain between 1 and ' + MAX_FILES + ' files.';
  }
  let total = 0;
  const encoder = new TextEncoder();
  for (const [path, source] of entries) {
    const size = encoder.encode(source).byteLength;
    if (!validPath(path)) return 'Invalid .srp path: ' + path;
    if (size > MAX_FILE_BYTES) return path + ' exceeds the 64 KiB source limit.';
    total += size;
  }
  if (total > MAX_TOTAL_BYTES) return 'Project sources exceed the 128 KiB total limit.';
  return null;
}

export function sourceFromHash(hash: string): string | null {
  if (!hash.startsWith('#code=')) return null;
  try {
    const source = decodeURIComponent(hash.slice(6));
    return new TextEncoder().encode(source).length <= MAX_SHARE_BYTES ? source : null;
  } catch {
    return null;
  }
}

export function makeShareUrl(origin: string, pathname: string, source: string): string | null {
  if (new TextEncoder().encode(source).length > MAX_SHARE_BYTES) return null;
  return origin + pathname + '#code=' + encodeURIComponent(source);
}
