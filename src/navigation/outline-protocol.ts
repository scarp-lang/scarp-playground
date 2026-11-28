import { validPath, MAX_FILE_BYTES } from '../workspace';

export const MAX_OUTLINE_ENTRIES = 256;
const MAX_OUTLINE_JSON_CHARS = 256 * 1024;
const MAX_OUTLINE_NAME_BYTES = 128;
const MAX_DEPTH = 65;

export const OUTLINE_KINDS = [
  'import', 'function', 'pure_function', 'type_parameter', 'parameter',
  'record', 'field', 'variant', 'variant_case', 'bind', 'var', 'repeat_index', 'match_binding',
] as const;
export type OutlineKind = typeof OUTLINE_KINDS[number];

export type OutlineEntry = {
  name: string;
  kind: OutlineKind;
  start: number;
  end: number;
  depth: number;
  public: boolean;
};

export type OutlineResult =
  | { ok: true; path: string; entries: OutlineEntry[]; truncated: boolean }
  | { ok: false; error: string; code?: string };

const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const encoder = new TextEncoder();

export const invalidOutline = (): OutlineResult =>
  ({ ok: false, error: 'Invalid or oversized source outline response.' });

function integer(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= min && value <= max;
}

/** Validate and project every field, excluding unknown nested Worker data. */
export function validatedOutlineResult(value: unknown): OutlineResult {
  if (!record(value) || typeof value.ok !== 'boolean') return invalidOutline();
  if (!value.ok) {
    if (typeof value.error !== 'string' || value.error.length > MAX_FILE_BYTES ||
        encoder.encode(value.error).byteLength > MAX_FILE_BYTES ||
        (value.code !== undefined && (typeof value.code !== 'string' || !/^E[0-9]{4}$/.test(value.code)))) {
      return invalidOutline();
    }
    return { ok: false, error: value.error, ...(typeof value.code === 'string' ? { code: value.code } : {}) };
  }
  if (!validPath(value.path) || !Array.isArray(value.entries) ||
      value.entries.length > MAX_OUTLINE_ENTRIES || typeof value.truncated !== 'boolean') return invalidOutline();
  const entries: OutlineEntry[] = [];
  let previousEnd = 0;
  for (const entry of value.entries) {
    if (!record(entry) || typeof entry.name !== 'string' || entry.name.length > MAX_OUTLINE_NAME_BYTES ||
        !/^[A-Za-z_][A-Za-z0-9_]*$/.test(entry.name) ||
        typeof entry.kind !== 'string' || !OUTLINE_KINDS.includes(entry.kind as OutlineKind) ||
        !integer(entry.start, previousEnd, MAX_FILE_BYTES) ||
        !integer(entry.end, entry.start + 1, MAX_FILE_BYTES) ||
        entry.end - entry.start !== entry.name.length ||
        !integer(entry.depth, 0, MAX_DEPTH) || typeof entry.public !== 'boolean') return invalidOutline();
    entries.push({ name: entry.name, kind: entry.kind as OutlineKind, start: entry.start,
      end: entry.end, depth: entry.depth, public: entry.public });
    previousEnd = entry.end;
  }
  return { ok: true, path: value.path, entries, truncated: value.truncated };
}

export function decodeOutlineReply(raw: unknown): OutlineResult {
  if (typeof raw !== 'string' || raw.length > MAX_OUTLINE_JSON_CHARS) return invalidOutline();
  try { return validatedOutlineResult(JSON.parse(raw)); } catch { return invalidOutline(); }
}

export type LocatedOutlineEntry = OutlineEntry & { line: number; column: number };
export type LocatedOutline =
  | { ok: true; path: string; entries: LocatedOutlineEntry[]; truncated: boolean }
  | { ok: false; error: string; code?: string };

function scalarBytes(value: string): number {
  const cp = value.codePointAt(0)!;
  return cp <= 0x7f ? 1 : cp <= 0x7ff ? 2 : cp <= 0xffff ? 3 : 4;
}

/** Verify source ownership and translate byte spans to Monaco UTF-16 columns
 * in one ordered scan. A malformed or stale result never navigates. */
export function locateOutline(result: OutlineResult, path: string, source: string): LocatedOutline {
  if (!result.ok) return result;
  if (result.path !== path || source.length > MAX_FILE_BYTES) return invalidOutline() as LocatedOutline;
  const bytes = encoder.encode(source);
  if (bytes.length > MAX_FILE_BYTES) return invalidOutline() as LocatedOutline;
  const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
  try {
    for (const entry of result.entries) {
      if (entry.end > bytes.length || decoder.decode(bytes.subarray(entry.start, entry.end)) !== entry.name) {
        return invalidOutline() as LocatedOutline;
      }
    }
  } catch { return invalidOutline() as LocatedOutline; }
  const entries: LocatedOutlineEntry[] = [];
  let offset = 0;
  let line = 1;
  let column = 1;
  let previousCR = false;
  for (const scalar of source) {
    const entry = result.entries[entries.length];
    if (entry && entry.start < offset) return invalidOutline() as LocatedOutline;
    if (entry?.start === offset) entries.push({ ...entry, line, column });
    if (scalar === '\r') { line++; column = 1; }
    else if (scalar === '\n') { if (!previousCR) line++; column = 1; }
    else column += scalar.length;
    previousCR = scalar === '\r';
    offset += scalarBytes(scalar);
  }
  if (entries.length !== result.entries.length) return invalidOutline() as LocatedOutline;
  return { ...result, entries };
}
