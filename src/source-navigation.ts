import { validPath, validateWorkspace, type Workspace } from './workspace';
import { quickOpenPosition } from './quick-open';
import { measureUtf8 } from './utf8';

export const MAX_SOURCE_BOOKMARKS = 24;
export const MAX_BOOKMARK_LABEL_BYTES = 80;
export const MAX_NAVIGATION_TRAIL = 80;

export type SourcePoint = Readonly<{
  path: string;
  line: number;
  column: number;
}>;
export type SourceBookmark = Readonly<{
  id: number;
  label: string;
  point: SourcePoint;
}>;
export type SourceTrail = Readonly<{
  back: SourcePoint[];
  current: SourcePoint | null;
  forward: SourcePoint[];
}>;
export type BookmarkChange =
  | { ok: true; bookmarks: SourceBookmark[]; bookmark?: SourceBookmark }
  | { ok: false; error: string };

const invalid = (error: string): BookmarkChange => ({ ok: false, error });

const samePoint = (a: SourcePoint, b: SourcePoint): boolean =>
  a.path === b.path && a.line === b.line && a.column === b.column;

export function emptySourceTrail(): SourceTrail {
  return { back: [], current: null, forward: [] };
}

export function validSourcePoint(workspace: Workspace, point: unknown): point is SourcePoint {
  if (!point || typeof point !== 'object' || Array.isArray(point)) return false;
  const candidate = point as Record<string, unknown>;
  if (!validPath(candidate.path) || !Object.hasOwn(workspace.files, candidate.path) ||
      !Number.isSafeInteger(candidate.line) || Number(candidate.line) < 1 ||
      !Number.isSafeInteger(candidate.column) || Number(candidate.column) < 1) return false;
  const path = candidate.path as string;
  const line = candidate.line as number;
  const column = candidate.column as number;
  const bounded = quickOpenPosition(workspace.files[path], line, column);
  return bounded.line === line && bounded.column === column;
}

function copyPoint(point: SourcePoint): SourcePoint {
  return { path: point.path, line: point.line, column: point.column };
}

function validBookmarkLabel(value: unknown): value is string {
  return typeof value === 'string' && value.length >= 1 &&
    value.trim() === value && value.trim().length >= 1 &&
    !Array.from(value).some(char => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127) &&
    measureUtf8(value, MAX_BOOKMARK_LABEL_BYTES).ok;
}

export function validatedBookmarks(workspace: Workspace, value: unknown): SourceBookmark[] | null {
  if (validateWorkspace(workspace) || !Array.isArray(value) || value.length > MAX_SOURCE_BOOKMARKS) {
    return null;
  }
  const ids = new Set<number>();
  const points = new Set<string>();
  const bookmarks: SourceBookmark[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const item = raw as Partial<SourceBookmark>;
    if (!Number.isSafeInteger(item.id) || (item.id ?? 0) < 1 ||
        (item.id ?? 0) > Number.MAX_SAFE_INTEGER ||
        !validBookmarkLabel(item.label) || !validSourcePoint(workspace, item.point)) return null;
    const point = item.point as SourcePoint;
    const key = point.path + '\0' + point.line + '\0' + point.column;
    if (ids.has(item.id!) || points.has(key)) return null;
    ids.add(item.id!);
    points.add(key);
    bookmarks.push({
      id: item.id!, label: item.label!, point: copyPoint(point),
    });
  }
  return bookmarks;
}

export function addSourceBookmark(
  workspace: Workspace, current: readonly SourceBookmark[], point: SourcePoint,
  label?: string,
): BookmarkChange {
  const bookmarks = validatedBookmarks(workspace, current);
  if (!bookmarks) return invalid('Source bookmarks are invalid or the workspace has changed.');
  if (bookmarks.length >= MAX_SOURCE_BOOKMARKS) {
    return invalid('A session can keep at most 24 source bookmarks.');
  }
  if (!validSourcePoint(workspace, point)) {
    return invalid('Place the cursor at a valid source position before bookmarking.');
  }
  if (bookmarks.some(bookmark => samePoint(bookmark.point, point))) {
    return invalid('A bookmark already exists at this source position.');
  }
  const name = label ?? point.path + ':' + point.line;
  if (!validBookmarkLabel(name)) {
    return invalid('Bookmark labels must contain 1–80 UTF-8 bytes of single-line text.');
  }
  const id = Math.max(0, ...bookmarks.map(bookmark => bookmark.id)) + 1;
  if (!Number.isSafeInteger(id)) return invalid('Cannot allocate a source bookmark identifier.');
  const bookmark = { id, label: name, point: copyPoint(point) };
  return { ok: true, bookmarks: [...bookmarks, bookmark], bookmark };
}

export function renameSourceBookmark(
  workspace: Workspace, current: readonly SourceBookmark[], id: number, label: string,
): BookmarkChange {
  const bookmarks = validatedBookmarks(workspace, current);
  if (!bookmarks) return invalid('Source bookmarks are invalid.');
  if (!validBookmarkLabel(label)) {
    return invalid('Use a nonempty single-line bookmark label of at most 80 UTF-8 bytes.');
  }
  const index = bookmarks.findIndex(bookmark => bookmark.id === id);
  if (index < 0) return invalid('Bookmark no longer exists.');
  return {
    ok: true, bookmarks: bookmarks.map((bookmark, offset) =>
      offset === index ? { ...bookmark, label } : bookmark),
  };
}

export function deleteSourceBookmark(
  workspace: Workspace, current: readonly SourceBookmark[], id: number,
): BookmarkChange {
  const bookmarks = validatedBookmarks(workspace, current);
  if (!bookmarks) return invalid('Source bookmarks are invalid.');
  const index = bookmarks.findIndex(bookmark => bookmark.id === id);
  if (index < 0) return invalid('Bookmark no longer exists.');
  return { ok: true, bookmarks: bookmarks.filter(item => item.id !== id) };
}

export function moveSourceBookmark(
  workspace: Workspace, current: readonly SourceBookmark[], id: number,
  direction: -1 | 1,
): BookmarkChange {
  const bookmarks = validatedBookmarks(workspace, current);
  if (!bookmarks) return invalid('Source bookmarks are invalid.');
  const index = bookmarks.findIndex(bookmark => bookmark.id === id);
  if (index < 0) return invalid('Bookmark no longer exists.');
  const next = index + direction;
  if (next < 0 || next >= bookmarks.length) return invalid('Bookmark is already at the boundary.');
  const swapped = [...bookmarks];
  [swapped[index], swapped[next]] = [swapped[next], swapped[index]];
  return { ok: true, bookmarks: swapped };
}

/** Invalid positions are removed, never snapped to a possibly different token. */
export function pruneSourceBookmarks(
  workspace: Workspace, current: readonly SourceBookmark[],
): SourceBookmark[] {
  if (validateWorkspace(workspace) || current.length > MAX_SOURCE_BOOKMARKS) return [];
  const accepted: SourceBookmark[] = [];
  const ids = new Set<number>();
  const positions = new Set<string>();
  for (const item of current) {
    if (!item || !Number.isSafeInteger(item.id) ||
        item.id < 1 || !validBookmarkLabel(item.label) ||
        !validSourcePoint(workspace, item.point)) continue;
    const key = item.point.path + '\0' + item.point.line + '\0' + item.point.column;
    if (ids.has(item.id) || positions.has(key)) continue;
    ids.add(item.id);
    positions.add(key);
    accepted.push({ id: item.id, label: item.label, point: copyPoint(item.point) });
  }
  return accepted;
}

function normalizedTrail(workspace: Workspace, raw: SourceTrail): SourceTrail {
  const back = Array.isArray(raw.back) ? raw.back.filter(point => validSourcePoint(workspace, point))
    .slice(-MAX_NAVIGATION_TRAIL).map(copyPoint) : [];
  const forward = Array.isArray(raw.forward) ? raw.forward.filter(point => validSourcePoint(workspace, point))
    .slice(0, MAX_NAVIGATION_TRAIL).map(copyPoint) : [];
  const current = validSourcePoint(workspace, raw.current) ? copyPoint(raw.current) : null;
  return { back, current, forward };
}

export function pruneSourceTrail(workspace: Workspace, trail: SourceTrail): SourceTrail {
  if (validateWorkspace(workspace)) return emptySourceTrail();
  return normalizedTrail(workspace, trail);
}

/**
 * Record a real navigation from the editor cursor to a validated target.
 * Consecutive duplicate jumps do not create redundant back-navigation steps.
 */
export function visitSourcePoint(
  workspace: Workspace, trail: SourceTrail, from: SourcePoint, target: SourcePoint,
): SourceTrail {
  const base = pruneSourceTrail(workspace, trail);
  if (!validSourcePoint(workspace, from) || !validSourcePoint(workspace, target)) return base;
  if (samePoint(from, target)) return { ...base, current: copyPoint(target) };
  const back = [...base.back];
  if (!back.length || !samePoint(back[back.length - 1], from)) back.push(copyPoint(from));
  return {
    back: back.slice(-MAX_NAVIGATION_TRAIL),
    current: copyPoint(target),
    forward: [],
  };
}

export type NavigationStep = Readonly<{ point: SourcePoint; trail: SourceTrail }>;

/** Back/Forward always preserve the actual editor cursor at the departure. */
export function stepSourceTrail(
  workspace: Workspace, trail: SourceTrail, from: SourcePoint,
  direction: -1 | 1,
): NavigationStep | null {
  if (!validSourcePoint(workspace, from)) return null;
  const base = pruneSourceTrail(workspace, trail);
  const stack = direction === -1 ? base.back : base.forward;
  if (stack.length === 0) return null;
  const target = direction === -1 ? stack.at(-1)! : stack[0];
  if (samePoint(target, from)) {
    // No movement, but remove the redundant entry so later steps can proceed.
    const trimmed = direction === -1 ? stack.slice(0, -1) : stack.slice(1);
    return stepSourceTrail(workspace, {
      ...base, [direction === -1 ? 'back' : 'forward']: trimmed,
    }, from, direction);
  }
  const back = direction === -1 ? base.back.slice(0, -1) : [...base.back, copyPoint(from)]
    .slice(-MAX_NAVIGATION_TRAIL);
  const forward = direction === -1 ? [copyPoint(from), ...base.forward].slice(0, MAX_NAVIGATION_TRAIL)
    : base.forward.slice(1);
  return {
    point: copyPoint(target),
    trail: { back, current: copyPoint(target), forward },
  };
}
