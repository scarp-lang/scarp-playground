import { describe, expect, it } from 'vitest';
import { compareLibraryBackup, defaultRestoreChoices, MAX_LIBRARY_BACKUP_BYTES, parseLibraryBackup, planLibraryRestore,
  serializeLibraryBackup, type RestoreChoice } from '../src/library/backup';
import type { ProjectLibrary, LibraryProject } from '../src/library/model';

const project = (name: string, source = 'print(1);', modified = 1): LibraryProject => ({
  name, modified, activeFile: 'main.srp', workspace: { entry: 'main.srp', files: { 'main.srp': source } },
});
const library = (...projects: LibraryProject[]): ProjectLibrary => ({ version: 1, projects });
const encoder = new TextEncoder();

describe('portable named snapshot backups', () => {
  it('round-trips exact source and name without arbitrary metadata', () => {
    const input = library({ ...project('नमस्ते 😀', 'print("é");\r\n'), stdin: 'private' } as LibraryProject);
    const raw = serializeLibraryBackup(input);
    if (!raw.ok) throw Error(raw.error);
    expect(raw.value).not.toContain('private');
    expect(parseLibraryBackup(encoder.encode(raw.value))).toEqual({ ok: true, value: library(project('नमस्ते 😀', 'print("é");\r\n')) });
  });
  it('rejects invalid encoding, wrong format, version, invalid snapshots and oversized files', () => {
    for (const raw of ['{}', 'null', '{', '{"format":"scarp-playground-library","version":2,"projects":[]}',
      JSON.stringify({ format: 'scarp-playground-library', version: 1, projects: [project('X'), project('x')] })]) {
      expect(parseLibraryBackup(encoder.encode(raw)).ok).toBe(false);
    }
    expect(parseLibraryBackup(Uint8Array.of(0xc3, 0x28)).ok).toBe(false);
    expect(parseLibraryBackup(new Uint8Array(MAX_LIBRARY_BACKUP_BYTES + 1)).ok).toBe(false);
  });
  it('classifies new, identical and conflicting names with normalized name identity', () => {
    const current = library(project('Cafe\u0301'), project('Different', 'old'));
    const incoming = library(project('CAFÉ'), project('different', 'new'), project('New'));
    const rows = compareLibraryBackup(current, incoming);
    if (!rows.ok) throw Error(rows.error);
    expect(Object.fromEntries(rows.value.map(row => [row.incoming.name, row.status]))).toEqual({ CAFÉ: 'identical', different: 'different', New: 'new' });
    expect(Object.fromEntries(defaultRestoreChoices(rows.value).map(row => [row.name, row.action]))).toEqual({
      CAFÉ: 'skip', different: 'skip', New: 'import',
    });
  });
  it('supports explicit replacement and rename while preserving unrelated snapshots', () => {
    const current = library(project('Keep'), project('Existing', 'old'));
    const backup = library(project('existing', 'new'), project('Extra'));
    const choices: RestoreChoice[] = [{ name: 'existing', action: 'replace' }, { name: 'Extra', action: 'rename', nextName: 'Renamed' }];
    const planned = planLibraryRestore(current, backup, choices);
    if (!planned.ok) throw Error(planned.error);
    expect(planned.value.projects.map(item => item.name)).toEqual(['Existing', 'Keep', 'Renamed']);
    expect(planned.value.projects[0].workspace.files['main.srp']).toBe('new');
    expect(current.projects[1].workspace.files['main.srp']).toBe('old');
  });
  it('rejects ambiguous choices, collisions, excessive totals and silent conflict replacement', () => {
    const current = library(project('One'), project('Two'));
    const backup = library(project('one', 'different'));
    for (const choices of [[], [{ name: 'one', action: 'import' }], [{ name: 'one', action: 'rename', nextName: 'TWO' }],
      [{ name: 'missing', action: 'skip' }], [{ name: 'one', action: 'skip' }, { name: 'one', action: 'skip' }]] as RestoreChoice[][]) {
      expect(planLibraryRestore(current, backup, choices).ok).toBe(false);
    }
    const six = library(...Array.from({ length: 6 }, (_, index) => project('Project ' + index)));
    expect(planLibraryRestore(six, library(project('Extra')), [{ name: 'Extra', action: 'import' }]).ok).toBe(false);
  });
});
