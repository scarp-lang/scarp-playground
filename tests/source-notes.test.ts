import { describe, expect, it } from 'vitest';
import {
  MAX_SOURCE_NOTES, MAX_SOURCE_NOTE_TITLE_BYTES,
  MAX_SOURCE_NOTE_BODY_BYTES, MAX_SOURCE_NOTE_TOTAL_BYTES,
  DEFAULT_SOURCE_NOTE_FILTER, emptySourceNotes, validatedSourceNotes,
  validSourceNotePoint, createSourceNote, updateSourceNote, setSourceNoteResolved,
  deleteSourceNote, clearSourceNotes, filterSourceNotes, sourceNotesSummary,
  type SourceNoteChange, type SourceNotes, type SourceNoteFilter,
} from '../src/source-notes';
import type { Workspace } from '../src/workspace';

const project: Workspace = {
  entry: 'main.srp',
  files: {
    'main.srp': 'print("😀");\nprint("second");\n',
    'lib/util.srp': 'pub bind answer = 42;\n',
  },
};
const defaults: SourceNoteChange = {
  title: 'Investigate output', body: 'Why does this print?',
  category: 'question',
  point: { path: 'main.srp', line: 1, column: 1 },
};
const create = (notes: SourceNotes = emptySourceNotes(),
  overrides: Partial<SourceNoteChange> = {}, workspace = project) =>
  createSourceNote(workspace, notes, { ...defaults, ...overrides });
const filter = (partial: Partial<SourceNoteFilter> = {}): SourceNoteFilter =>
  ({ ...DEFAULT_SOURCE_NOTE_FILTER, ...partial });

describe('bounded source annotation model', () => {
  it('starts with a detached, empty session-only note collection', () => {
    expect(emptySourceNotes()).toEqual({ items: [], nextId: 1 });
    expect(sourceNotesSummary(project, emptySourceNotes())).toEqual({
      total: 0, resolved: 0, unresolved: 0, orphaned: 0, bodyBytes: 0,
    });
  });

  it('validates exact Monaco coordinates including trailing blank lines', () => {
    expect(validSourceNotePoint(project, { path: 'main.srp', line: 1, column: 1 })).toBe(true);
    expect(validSourceNotePoint(project, { path: 'main.srp', line: 3, column: 1 })).toBe(true);
    expect(validSourceNotePoint(project, { path: 'lib/util.srp', line: 1, column: 9 })).toBe(true);
  });

  it('rejects traversal, missing files, fractions and impossible coordinates', () => {
    const inputs: unknown[] = [
      null, {}, { path: '../outside.srp', line: 1, column: 1 },
      { path: '/main.srp', line: 1, column: 1 },
      { path: 'absent.srp', line: 1, column: 1 },
      { path: 'main.srp', line: 0, column: 1 },
      { path: 'main.srp', line: 4, column: 1 },
      { path: 'main.srp', line: 1, column: 0 },
      { path: 'main.srp', line: 1, column: 100 },
      { path: 'main.srp', line: 1.5, column: 1 },
      { path: 'main.srp', line: 2, column: Number.POSITIVE_INFINITY },
    ];
    for (const input of inputs) expect(validSourceNotePoint(project, input)).toBe(false);
  });

  it('refuses positioning a cursor in the middle of a Unicode surrogate pair', () => {
    const row = project.files['main.srp'].split('\n')[0];
    const offset = row.indexOf('😀');
    expect(validSourceNotePoint(project, { path: 'main.srp',
      line: 1, column: offset + 1 })).toBe(true);
    expect(validSourceNotePoint(project, { path: 'main.srp',
      line: 1, column: offset + 2 })).toBe(false);
    expect(validSourceNotePoint(project, { path: 'main.srp',
      line: 1, column: offset + 3 })).toBe(true);
  });

  it('creates one immutable-style note with a stable identifier', () => {
    const original = emptySourceNotes();
    const result = create(original);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.notes).toEqual({
      items: [{
        id: 1, ...defaults, resolved: false,
      }],
      nextId: 2,
    });
    expect(original.items).toHaveLength(0);
    expect(result.note?.id).toBe(1);
  });

  it('preserves multiline Unicode annotation text without reformatting it', () => {
    const body = 'हिंदी 😀\r\nQuestion two.\n';
    const result = create(emptySourceNotes(), { body });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.note?.body).toBe(body);
  });

  it('allows an empty note body but refuses an empty title', () => {
    expect(create(emptySourceNotes(), { body: '' }).ok).toBe(true);
    for (const title of ['', ' ', ' padded', 'trailing ', 'line\nbreak']) {
      expect(create(emptySourceNotes(), { title }).ok).toBe(false);
    }
  });

  it('enforces UTF-8 title length instead of treating all code units equally', () => {
    const valid = '😀'.repeat(MAX_SOURCE_NOTE_TITLE_BYTES / 4);
    expect(create(emptySourceNotes(), { title: valid }).ok).toBe(true);
    expect(create(emptySourceNotes(), { title: valid + 'x' }).ok).toBe(false);
  });

  it('enforces each note body limit', () => {
    const full = 'x'.repeat(MAX_SOURCE_NOTE_BODY_BYTES);
    expect(create(emptySourceNotes(), { body: full }).ok).toBe(true);
    expect(create(emptySourceNotes(), { body: full + 'y' }).ok).toBe(false);
  });

  it('rejects malformed Unicode and bidirectional direction-control characters', () => {
    for (const invalid of ['\uD800', '\uDC00', '\u202E', '\u2066']) {
      expect(create(emptySourceNotes(), { title: 'Title' + invalid }).ok).toBe(false);
      expect(create(emptySourceNotes(), { body: 'Body' + invalid }).ok).toBe(false);
    }
  });

  it('accepts all supported annotation categories', () => {
    for (const category of ['idea', 'question', 'bug', 'learning'] as const) {
      const result = create(emptySourceNotes(), { category });
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.note?.category).toBe(category);
    }
  });

  it('rejects unknown categories or untyped note fields', () => {
    expect(create(emptySourceNotes(), { category: 'other' as SourceNoteChange['category'] }).ok)
      .toBe(false);
    expect(create(emptySourceNotes(), { body: 42 as unknown as string }).ok).toBe(false);
    expect(create(emptySourceNotes(), { title: [] as unknown as string }).ok).toBe(false);
  });

  it('rejects invalid or absent locations during creation', () => {
    expect(create(emptySourceNotes(), { point: {
      path: 'absent.srp', line: 1, column: 1,
    } }).ok).toBe(false);
    expect(create(emptySourceNotes(), { point: {
      path: 'main.srp', line: 20, column: 1,
    } }).ok).toBe(false);
  });

  it('enforces the 32-note tab capacity without overwriting earlier records', () => {
    let notes = emptySourceNotes();
    for (let i = 1; i <= MAX_SOURCE_NOTES; i++) {
      const result = create(notes, { title: 'Note ' + i });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      notes = result.notes;
    }
    expect(notes.items).toHaveLength(MAX_SOURCE_NOTES);
    expect(create(notes, { title: 'Too many' }).ok).toBe(false);
    expect(notes.items[0].title).toBe('Note 1');
  });

  it('enforces the 16 KiB total note-body budget across records', () => {
    let notes = emptySourceNotes();
    for (let i = 1; i <= 16; i++) {
      const result = create(notes, {
        title: 'Large ' + i, body: 'x'.repeat(MAX_SOURCE_NOTE_BODY_BYTES),
      });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      notes = result.notes;
    }
    expect(sourceNotesSummary(project, notes)?.bodyBytes).toBe(MAX_SOURCE_NOTE_TOTAL_BYTES);
    expect(create(notes, { title: 'Overflow', body: 'y' }).ok).toBe(false);
  });

  it('projects untrusted extra keys off of in-memory annotation objects', () => {
    const first = create();
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const polluted = {
      ...first.notes, stdin: 'PRIVATE',
      items: first.notes.items.map(item => ({
        ...item, compilerOutput: 'PRIVATE', point: { ...item.point, secret: 'PRIVATE' },
      })),
    };
    const projected = validatedSourceNotes(polluted);
    expect(projected).toEqual(first.notes);
    expect(JSON.stringify(projected)).not.toContain('PRIVATE');
  });

  it('rejects invalid collections and malformed or duplicated IDs', () => {
    const result = create();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const note = result.notes.items[0];
    const invalid: unknown[] = [
      null, {}, { items: [], nextId: 0 },
      { items: [note, note], nextId: 3 },
      { items: [{ ...note, id: -1 }], nextId: 3 },
      { items: [{ ...note, id: 2 }], nextId: 2 },
      { items: [{ ...note, resolved: 'yes' }], nextId: 3 },
      { items: [{ ...note, body: '\uD800' }], nextId: 3 },
      { items: [{ ...note, title: '' }], nextId: 3 },
      { items: [{ ...note, point: { ...note.point, column: 0 } }], nextId: 3 },
      { items: Array.from({ length: MAX_SOURCE_NOTES + 1 }, () => note), nextId: 100 },
    ];
    for (const item of invalid) expect(validatedSourceNotes(item)).toBeNull();
  });

  it('edits title, body, category and location in one validated operation', () => {
    const result = create();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const updated = updateSourceNote(project, result.notes, 1, {
      title: 'Reviewed parser',
      body: 'Look at helper code',
      category: 'learning',
      point: { path: 'lib/util.srp', line: 1, column: 7 },
    });
    expect(updated.ok).toBe(true);
    if (!updated.ok) return;
    expect(updated.notes.items[0]).toMatchObject({
      id: 1, title: 'Reviewed parser', body: 'Look at helper code',
      category: 'learning', point: { path: 'lib/util.srp' },
    });
    expect(result.notes.items[0].title).toBe(defaults.title);
  });

  it('refuses an edit with an impossible location or invalid title', () => {
    const result = create();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(updateSourceNote(project, result.notes, 1, {
      ...defaults, title: '',
    }).ok).toBe(false);
    expect(updateSourceNote(project, result.notes, 1, {
      ...defaults, point: { path: 'main.srp', line: 999, column: 1 },
    }).ok).toBe(false);
  });

  it('resolves and reopens a note without altering its content', () => {
    const result = create();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const done = setSourceNoteResolved(result.notes, 1, true);
    expect(done.ok).toBe(true);
    if (!done.ok) return;
    expect(done.notes.items[0].resolved).toBe(true);
    const reopened = setSourceNoteResolved(done.notes, 1, false);
    expect(reopened.ok).toBe(true);
    if (reopened.ok) expect(reopened.notes.items[0].resolved).toBe(false);
    expect(result.notes.items[0].resolved).toBe(false);
  });

  it('rejects unknown note IDs for all mutating operations', () => {
    const result = create();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(updateSourceNote(project, result.notes, 500, defaults).ok).toBe(false);
    expect(setSourceNoteResolved(result.notes, 500, true).ok).toBe(false);
    expect(deleteSourceNote(result.notes, 500).ok).toBe(false);
  });

  it('removes a selected note without reusing a deleted identifier', () => {
    const one = create();
    expect(one.ok).toBe(true);
    if (!one.ok) return;
    const two = create(one.notes, { title: 'Second' });
    expect(two.ok).toBe(true);
    if (!two.ok) return;
    const removed = deleteSourceNote(two.notes, 1);
    expect(removed.ok).toBe(true);
    if (!removed.ok) return;
    expect(removed.notes.items.map(item => item.id)).toEqual([2]);
    const three = create(removed.notes, { title: 'Third' });
    expect(three.ok).toBe(true);
    if (three.ok) expect(three.note?.id).toBe(3);
  });

  it('clears note text while preserving monotonic IDs', () => {
    const first = create();
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(clearSourceNotes(first.notes)).toEqual({ items: [], nextId: 2 });
  });

  it('keeps orphaned notes after a source file is deleted', () => {
    const first = create(emptySourceNotes(), { point: {
      path: 'lib/util.srp', line: 1, column: 1,
    } });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const changed: Workspace = {
      entry: 'main.srp', files: { 'main.srp': 'print("updated");\n' },
    };
    expect(sourceNotesSummary(changed, first.notes)?.orphaned).toBe(1);
    expect(filterSourceNotes(changed, first.notes, filter({ status: 'orphaned' }))).toHaveLength(1);
    expect(filterSourceNotes(changed, first.notes, filter({ status: 'open' }))).toHaveLength(0);
  });

  it('does not silently move a note when the original line is shortened', () => {
    const first = create(emptySourceNotes(), { point: {
      path: 'main.srp', line: 2, column: 9,
    } });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const changed: Workspace = { entry: 'main.srp', files: { 'main.srp': 'a\nb' } };
    expect(sourceNotesSummary(changed, first.notes)?.orphaned).toBe(1);
  });

  it('filters by category, source file and text in a case-insensitive way', () => {
    const one = create();
    expect(one.ok).toBe(true);
    if (!one.ok) return;
    const two = create(one.notes, {
      title: 'Helper learning', body: 'Investigate references', category: 'learning',
      point: { path: 'lib/util.srp', line: 1, column: 1 },
    });
    expect(two.ok).toBe(true);
    if (!two.ok) return;
    expect(filterSourceNotes(project, two.notes, filter({ query: 'REFERENCES' }))).toHaveLength(1);
    expect(filterSourceNotes(project, two.notes, filter({ category: 'learning' }))).toHaveLength(1);
    expect(filterSourceNotes(project, two.notes, filter({ path: 'lib/util.srp' }))).toHaveLength(1);
    expect(filterSourceNotes(project, two.notes, filter({ query: 'missing' }))).toEqual([]);
  });

  it('rejects invalid filters instead of revealing all annotation content', () => {
    const first = create();
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const invalid: Partial<SourceNoteFilter>[] = [
      { status: 'other' as SourceNoteFilter['status'] },
      { category: 'other' as SourceNoteFilter['category'] },
      { path: '../escape.srp' },
      { query: 'x'.repeat(129) },
    ];
    for (const value of invalid) {
      expect(filterSourceNotes(project, first.notes, { ...filter(), ...value })).toEqual([]);
    }
  });

  it('offers only an ephemeral note schema, not an export or storage API', () => {
    const first = create();
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(Object.keys(first.notes)).toEqual(['items', 'nextId']);
    expect(Object.keys(first.notes.items[0]).sort()).toEqual([
      'body', 'category', 'id', 'point', 'resolved', 'title',
    ]);
  });
});
