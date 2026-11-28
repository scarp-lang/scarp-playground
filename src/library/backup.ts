import { MAX_LIBRARY_JSON_BYTES, libraryNameKey, validateLibrary, type LibraryProject, type LibraryResult,
  type ProjectLibrary } from './model';
import { sameWorkspaceContents } from '../session-safety';
import { isUtf8Text } from '../utf8';

export const LIBRARY_BACKUP_FORMAT = 'scarp-playground-library';
export const MAX_LIBRARY_BACKUP_BYTES = MAX_LIBRARY_JSON_BYTES + 4096;
const bad = (error: string): { ok: false; error: string } => ({ ok: false, error });
const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export function serializeLibraryBackup(library: unknown): LibraryResult<string> {
  const checked = validateLibrary(library);
  if (!checked.ok) return checked;
  const text = JSON.stringify({ format: LIBRARY_BACKUP_FORMAT, version: 1, projects: checked.value.projects });
  return isUtf8Text(text, MAX_LIBRARY_BACKUP_BYTES) ? { ok: true, value: text } : bad('Library backup exceeds its size limit.');
}

export function parseLibraryBackup(raw: Uint8Array): LibraryResult<ProjectLibrary> {
  if (!(raw instanceof Uint8Array) || raw.byteLength > MAX_LIBRARY_BACKUP_BYTES) return bad('Library backup exceeds its size limit.');
  let value: unknown;
  try { value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(raw)); }
  catch { return bad('The selected library backup is not valid UTF-8 JSON.'); }
  if (!record(value) || value.format !== LIBRARY_BACKUP_FORMAT || value.version !== 1) {
    return bad('Unsupported project library backup format or version.');
  }
  return validateLibrary({ version: 1, projects: value.projects });
}

export type BackupConflict = 'new' | 'identical' | 'different';
export type BackupRow = { incoming: LibraryProject; existing: LibraryProject | null; status: BackupConflict };
export type RestoreChoice = { name: string; action: 'skip' | 'import' | 'replace' | 'rename'; nextName?: string };

export function compareLibraryBackup(current: ProjectLibrary, backup: ProjectLibrary): LibraryResult<BackupRow[]> {
  const existing = validateLibrary(current);
  if (!existing.ok) return existing;
  const incoming = validateLibrary(backup);
  if (!incoming.ok) return incoming;
  return { ok: true, value: incoming.value.projects.map(project => {
    const match = existing.value.projects.find(item => libraryNameKey(item.name) === libraryNameKey(project.name)) ?? null;
    return { incoming: project, existing: match, status: !match ? 'new' :
      match.activeFile === project.activeFile && sameWorkspaceContents(match.workspace, project.workspace) ? 'identical' : 'different' };
  }) };
}

export function defaultRestoreChoices(rows: readonly BackupRow[]): RestoreChoice[] {
  return rows.map(row => ({ name: row.incoming.name, action: row.status === 'new' ? 'import' : 'skip' }));
}

/** Explicit merge plan. No deletion of unrelated projects; no automatic
 * overwrite, case-folded collision or silent generated name. */
export function planLibraryRestore(current: ProjectLibrary, backup: ProjectLibrary,
  choices: readonly RestoreChoice[]): LibraryResult<ProjectLibrary> {
  const rows = compareLibraryBackup(current, backup);
  if (!rows.ok) return rows;
  const checked = validateLibrary(current);
  if (!checked.ok) return checked;
  if (choices.length !== rows.value.length || new Set(choices.map(choice => choice.name)).size !== choices.length) {
    return bad('Choose exactly one action for each imported snapshot.');
  }
  const projects = checked.value.projects;
  for (const row of rows.value) {
    const choice = choices.find(item => item.name === row.incoming.name);
    if (!choice) return bad('A backup restore choice is missing.');
    if (choice.action === 'skip') continue;
    if (choice.action === 'replace') {
      if (!row.existing || row.status !== 'different') return bad('Only a conflicting saved snapshot can be replaced.');
      const index = projects.findIndex(item => item.name === row.existing?.name);
      if (index < 0) return bad('A saved snapshot is no longer available.');
      projects[index] = { ...row.incoming, name: row.existing.name };
    } else if (choice.action === 'import') {
      if (row.status !== 'new') return bad('Conflicting names require an explicit replacement or rename.');
      projects.push(row.incoming);
    } else if (choice.action === 'rename') {
      if (typeof choice.nextName !== 'string' || !choice.nextName.trim()) return bad('Enter a new snapshot name.');
      projects.push({ ...row.incoming, name: choice.nextName.trim() });
    } else return bad('Unknown backup restore action.');
  }
  return validateLibrary({ version: 1, projects });
}
