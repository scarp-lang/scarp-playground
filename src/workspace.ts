export const MAX_FILES = 12;
export const MAX_FILE_BYTES = 64 * 1024;
export const MAX_TOTAL_BYTES = 128 * 1024;
export const MAX_SHARE_BYTES = 2000;

export type Workspace = { entry: string; files: Record<string, string> };

/** A virtual filename is an ASCII-only path, never a host filesystem path. */
export function validPath(path: unknown): path is string {
  // Reject overlong paths before evaluating the pattern. This also avoids
  // coercing unexpected objects (or Symbols) into user-visible error text.
  return typeof path === 'string' && path.length <= 128 &&
    /^(?!\.)(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_-]+\.srp$/.test(path);
}

/**
 * Validate *runtime* input, not just the TypeScript shape. Shared URLs,
 * imported projects and browser message boundaries can carry malformed JSON.
 * Reject unexpected source values instead of silently stringifying them.
 */
export function validateWorkspace(value: unknown): string | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return 'Invalid Scarp workspace data.';
  }
  const candidate = value as Record<string, unknown>;
  if (typeof candidate.files !== 'object' || candidate.files === null ||
      Array.isArray(candidate.files)) {
    return 'Invalid Scarp workspace files.';
  }
  const files = candidate.files as Record<string, unknown>;
  if (!validPath(candidate.entry) || !Object.hasOwn(files, candidate.entry)) {
    return 'The selected entry must be an existing .srp file.';
  }

  const entries = Object.entries(files);
  if (entries.length === 0 || entries.length > MAX_FILES) {
    return 'A workspace must contain between 1 and ' + MAX_FILES + ' files.';
  }
  let total = 0;
  const encoder = new TextEncoder();
  for (const [path, source] of entries) {
    if (!validPath(path)) return 'Invalid .srp path: ' + path.slice(0, 128);
    if (typeof source !== 'string') {
      return 'The source in ' + path + ' must be text.';
    }
    const size = encoder.encode(source).byteLength;
    if (size > MAX_FILE_BYTES) return path + ' exceeds the 64 KiB source limit.';
    total += size;
    if (total > MAX_TOTAL_BYTES) {
      return 'Project sources exceed the 128 KiB total limit.';
    }
  }
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
