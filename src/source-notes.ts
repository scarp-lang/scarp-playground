import { isUtf8Text, measureUtf8 } from './utf8';
import { validPath, validateWorkspace, type Workspace } from './workspace';

export const MAX_SOURCE_NOTES = 32;
export const MAX_SOURCE_NOTE_TITLE_BYTES = 80;
export const MAX_SOURCE_NOTE_BODY_BYTES = 1024;
export const MAX_SOURCE_NOTE_TOTAL_BYTES = 16 * 1024;
export const MAX_SOURCE_NOTE_QUERY = 128;
export const SOURCE_NOTE_CATEGORIES = ['idea', 'question', 'bug', 'learning'] as const;

export type SourceNoteCategory = typeof SOURCE_NOTE_CATEGORIES[number];
export type SourceNotePoint = Readonly<{ path: string; line: number; column: number }>;
export type SourceNote = Readonly<{
  id: number;
  title: string;
  body: string;
  category: SourceNoteCategory;
  point: SourceNotePoint;
  resolved: boolean;
}>;
export type SourceNotes = Readonly<{ items: SourceNote[]; nextId: number }>;

export type SourceNoteChange = Readonly<{
  title: string; body: string; category: SourceNoteCategory; point: SourceNotePoint;
}>;
export type SourceNoteResult =
  | { ok: true; notes: SourceNotes; note?: SourceNote }
  | { ok: false; error: string };

export type SourceNoteFilter = Readonly<{
  category: SourceNoteCategory | 'all';
  status: 'all' | 'open' | 'resolved' | 'orphaned';
  path: string | 'all';
  query: string;
}>;
export const DEFAULT_SOURCE_NOTE_FILTER: SourceNoteFilter = {
  category: 'all', status: 'all', path: 'all', query: '',
};

function invalid(error: string): SourceNoteResult { return { ok: false, error }; }

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function textIsSafe(text: unknown, bytes: number, multiline: boolean): text is string {
  if (typeof text !== 'string' || !isUtf8Text(text, bytes)) return false;
  for (const character of text) {
    const code = character.codePointAt(0)!;
    const allowedWhitespace = multiline && (code === 9 || code === 10 || code === 13);
    if ((code < 32 && !allowedWhitespace) || code === 127 ||
        code === 0x061c || code === 0x200e || code === 0x200f ||
        (code >= 0x202a && code <= 0x202e) ||
        (code >= 0x2066 && code <= 0x2069)) return false;
  }
  return true;
}

function validTitle(value: unknown): value is string {
  return textIsSafe(value, MAX_SOURCE_NOTE_TITLE_BYTES, false) &&
    value.trim().length > 0 && value === value.trim();
}
function validBody(value: unknown): value is string {
  return textIsSafe(value, MAX_SOURCE_NOTE_BODY_BYTES, true);
}
function validCategory(value: unknown): value is SourceNoteCategory {
  return typeof value === 'string' &&
    SOURCE_NOTE_CATEGORIES.includes(value as SourceNoteCategory);
}
function validPointRecord(value: unknown): value is SourceNotePoint {
  return object(value) && validPath(value.path) &&
    Number.isSafeInteger(value.line) && Number(value.line) >= 1 &&
    Number.isSafeInteger(value.column) && Number(value.column) >= 1;
}
function copyPoint(point: SourceNotePoint): SourceNotePoint {
  return { path: point.path, line: point.line, column: point.column };
}
function validChange(change: unknown): change is SourceNoteChange & Record<string, unknown> {
  return object(change) && validTitle(change.title) && validBody(change.body) &&
    validCategory(change.category) && validPointRecord(change.point);
}

export function validSourceNotePoint(workspace: Workspace, point: unknown): point is SourceNotePoint {
  if (!workspace || !object(workspace.files) || !validPointRecord(point) ||
      !Object.hasOwn(workspace.files, point.path)) return false;
  const source = workspace.files[point.path];
  if (typeof source !== 'string') return false;
  const line = source.split(/\r\n|\r|\n/)[point.line - 1];
  if (line === undefined || point.column > line.length + 1) return false;

  // Monaco uses 1-based UTF-16 columns. Refuse the middle of a surrogate
  // pair instead of pretending that a split Unicode scalar is a location.
  const index = point.column - 1;
  if (index > 0 && index < line.length) {
    const before = line.charCodeAt(index - 1);
    const after = line.charCodeAt(index);
    if (before >= 0xd800 && before <= 0xdbff &&
        after >= 0xdc00 && after <= 0xdfff) return false;
  }
  return true;
}

export function emptySourceNotes(): SourceNotes {
  return { items: [], nextId: 1 };
}

/**
 * Strictly project caller-provided records onto a small in-memory schema.
 * Do not validate coordinates against the *current* workspace here: notes
 * referring to deleted files remain visible as intentionally orphaned notes.
 */
export function validatedSourceNotes(value: unknown): SourceNotes | null {
  if (!object(value) || !Array.isArray(value.items) ||
      value.items.length > MAX_SOURCE_NOTES ||
      !Number.isSafeInteger(value.nextId) || Number(value.nextId) < 1) return null;
  const items: SourceNote[] = [];
  let lastId = 0;
  let totalBodyBytes = 0;
  for (const raw of value.items) {
    if (!object(raw) || !Number.isSafeInteger(raw.id) || Number(raw.id) <= lastId ||
        Number(raw.id) >= Number(value.nextId) ||
        !validChange(raw) || typeof raw.resolved !== 'boolean') return null;
    const measurement = measureUtf8(raw.body, MAX_SOURCE_NOTE_BODY_BYTES);
    if (!measurement.ok) return null;
    totalBodyBytes += measurement.bytes;
    if (totalBodyBytes > MAX_SOURCE_NOTE_TOTAL_BYTES) return null;
    lastId = Number(raw.id);
    items.push({
      id: lastId, title: raw.title, body: raw.body,
      category: raw.category, resolved: raw.resolved,
      point: copyPoint(raw.point),
    });
  }
  return { items, nextId: Number(value.nextId) };
}

function totalBytes(items: readonly SourceNote[]): number {
  let bytes = 0;
  for (const item of items) {
    const measurement = measureUtf8(item.body, MAX_SOURCE_NOTE_BODY_BYTES);
    if (!measurement.ok) return Number.POSITIVE_INFINITY;
    bytes += measurement.bytes;
  }
  return bytes;
}

export function createSourceNote(
  workspace: Workspace, notes: SourceNotes, change: SourceNoteChange,
): SourceNoteResult {
  const valid = validatedSourceNotes(notes);
  if (!valid || validateWorkspace(workspace)) return invalid('The source workspace or notes are invalid.');
  if (!validChange(change)) return invalid('Provide a valid title, note text, category and location.');
  if (!validSourceNotePoint(workspace, change.point)) {
    return invalid('Select an existing Scarp source location.');
  }
  if (valid.items.length >= MAX_SOURCE_NOTES) return invalid('This tab can contain at most 32 notes.');
  const measured = measureUtf8(change.body, MAX_SOURCE_NOTE_BODY_BYTES);
  if (!measured.ok || totalBytes(valid.items) + measured.bytes > MAX_SOURCE_NOTE_TOTAL_BYTES) {
    return invalid('The notes exceed the 16 KiB total text budget.');
  }
  if (!Number.isSafeInteger(valid.nextId + 1)) return invalid('No more note identifiers are available.');
  const note: SourceNote = {
    id: valid.nextId, title: change.title, body: change.body,
    category: change.category, point: copyPoint(change.point), resolved: false,
  };
  return {
    ok: true, notes: {
      items: [...valid.items, note], nextId: valid.nextId + 1,
    }, note,
  };
}

export function updateSourceNote(
  workspace: Workspace, notes: SourceNotes, id: number, change: SourceNoteChange,
): SourceNoteResult {
  const valid = validatedSourceNotes(notes);
  if (!valid || validateWorkspace(workspace)) return invalid('The source workspace or notes are invalid.');
  if (!valid.items.some(item => item.id === id)) return invalid('The selected note was not found.');
  if (!validChange(change)) return invalid('Invalid note details.');
  if (!validSourceNotePoint(workspace, change.point)) {
    return invalid('Choose an existing source location for the updated note.');
  }
  const items = valid.items.map(item => item.id === id ? {
    ...item, title: change.title, body: change.body,
    category: change.category, point: copyPoint(change.point),
  } : item);
  if (totalBytes(items) > MAX_SOURCE_NOTE_TOTAL_BYTES) {
    return invalid('The updated notes would exceed the 16 KiB total text budget.');
  }
  return { ok: true, notes: { items, nextId: valid.nextId } };
}

export function setSourceNoteResolved(
  notes: SourceNotes, id: number, resolved: boolean,
): SourceNoteResult {
  const valid = validatedSourceNotes(notes);
  if (!valid) return invalid('The note journal is invalid.');
  if (typeof resolved !== 'boolean') return invalid('Invalid note review state.');
  if (!valid.items.some(item => item.id === id)) return invalid('The selected note was not found.');
  return {
    ok: true, notes: {
      items: valid.items.map(item => item.id === id ? { ...item, resolved } : item),
      nextId: valid.nextId,
    },
  };
}

export function deleteSourceNote(notes: SourceNotes, id: number): SourceNoteResult {
  const valid = validatedSourceNotes(notes);
  if (!valid) return invalid('The note journal is invalid.');
  if (!valid.items.some(item => item.id === id)) return invalid('The selected note was not found.');
  return {
    ok: true, notes: {
      items: valid.items.filter(item => item.id !== id),
      nextId: valid.nextId,
    },
  };
}

export function clearSourceNotes(notes: SourceNotes): SourceNotes {
  return { items: [], nextId: validatedSourceNotes(notes)?.nextId ?? 1 };
}

export function filterSourceNotes(
  workspace: Workspace, notes: SourceNotes, filter: SourceNoteFilter,
): SourceNote[] {
  const valid = validatedSourceNotes(notes);
  if (!valid || validateWorkspace(workspace) || !filter ||
      typeof filter.query !== 'string' || filter.query.length > MAX_SOURCE_NOTE_QUERY ||
      (filter.category !== 'all' && !validCategory(filter.category)) ||
      !['all', 'open', 'resolved', 'orphaned'].includes(filter.status) ||
      (filter.path !== 'all' && !validPath(filter.path))) return [];
  const needle = filter.query.trim().toLocaleLowerCase();
  return valid.items.filter(note => {
    const orphan = !validSourceNotePoint(workspace, note.point);
    return (filter.category === 'all' || filter.category === note.category) &&
      (filter.path === 'all' || filter.path === note.point.path) &&
      (filter.status === 'all' ||
        (filter.status === 'orphaned' ? orphan :
          filter.status === 'resolved' ? note.resolved : !note.resolved && !orphan)) &&
      (!needle || (note.title + ' ' + note.body + ' ' + note.point.path)
        .toLocaleLowerCase().includes(needle));
  });
}

export function sourceNotesSummary(workspace: Workspace, notes: SourceNotes):
  | { total: number; resolved: number; unresolved: number; orphaned: number; bodyBytes: number }
  | null {
  const valid = validatedSourceNotes(notes);
  if (!valid || validateWorkspace(workspace)) return null;
  return {
    total: valid.items.length,
    resolved: valid.items.filter(item => item.resolved).length,
    unresolved: valid.items.filter(item => !item.resolved).length,
    orphaned: valid.items.filter(item => !validSourceNotePoint(workspace, item.point)).length,
    bodyBytes: totalBytes(valid.items),
  };
}
