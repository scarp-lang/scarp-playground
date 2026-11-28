import { validateWorkspace, MAX_TOTAL_BYTES, type Workspace } from '../workspace';
import { sameWorkspaceContents } from '../session-safety';

export const MAX_LIBRARY_PROJECTS = 6;
export const MAX_LIBRARY_NAME = 60;
export const MAX_LIBRARY_SOURCE_BYTES = 4 * MAX_TOTAL_BYTES;
export const MAX_LIBRARY_JSON_BYTES = 6 * MAX_LIBRARY_SOURCE_BYTES + 32 * 1024;

export type LibraryProject = {
  name: string;
  modified: number;
  workspace: Workspace;
  activeFile: string;
};

export type ProjectLibrary = { version: 1; projects: LibraryProject[] };
export type LibraryResult<T> = { ok: true; value: T } | { ok: false; error: string };

const encoder = new TextEncoder();
const record = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const failure = (error: string): { ok: false; error: string } => ({ ok: false, error });

export const emptyLibrary = (): ProjectLibrary => ({ version: 1, projects: [] });

/** Names are display labels, never paths, IDs, or HTML. */
export function validLibraryName(name: unknown): name is string {
  return typeof name === 'string' && name.length >= 1 && name.length <= MAX_LIBRARY_NAME &&
    name === name.trim() && [...name].every(char => {
      const cp = char.codePointAt(0)!;
      return cp >= 32 && cp !== 127 && !(cp >= 0xd800 && cp <= 0xdfff) &&
        !(cp >= 0x80 && cp <= 0x9f) && cp !== 0x2028 && cp !== 0x2029;
    });
}

export function libraryNameKey(name: string): string {
  return name.normalize('NFC').toLowerCase();
}

export function projectBytes(workspace: Workspace): number {
  return Object.values(workspace.files).reduce((sum, source) => sum + encoder.encode(source).byteLength, 0);
}

function validDate(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= 8_640_000_000_000_000;
}

function copyProject(item: LibraryProject): LibraryProject {
  return { name: item.name, modified: item.modified,
    workspace: { entry: item.workspace.entry, files: Object.fromEntries(Object.entries(item.workspace.files).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)) },
    activeFile: item.activeFile };
}

/** Validate every stored snapshot and detach only known source fields. */
export function validateLibrary(value: unknown): LibraryResult<ProjectLibrary> {
  if (!record(value) || value.version !== 1 || !Array.isArray(value.projects) ||
      value.projects.length > MAX_LIBRARY_PROJECTS) return failure('Invalid or unsupported project library format.');
  const keys = new Set<string>();
  const projects: LibraryProject[] = [];
  let bytes = 0;
  for (const item of value.projects) {
    if (!record(item) || !validLibraryName(item.name) || !validDate(item.modified) ||
        validateWorkspace(item.workspace)) return failure('A saved project has invalid metadata or sources.');
    const workspace = item.workspace as Workspace;
    if (typeof item.activeFile !== 'string' || !Object.hasOwn(workspace.files, item.activeFile)) {
      return failure('A saved project has an invalid active source.');
    }
    const key = libraryNameKey(item.name);
    if (keys.has(key)) return failure('Saved project names must be unique.');
    keys.add(key);
    // TextEncoder must not silently substitute unpaired UTF-16 surrogates.
    for (const source of Object.values(workspace.files)) {
      for (const char of source) {
        const cp = char.codePointAt(0)!;
        if (cp >= 0xd800 && cp <= 0xdfff) return failure('A saved project contains invalid Unicode.');
      }
    }
    bytes += projectBytes(workspace);
    if (bytes > MAX_LIBRARY_SOURCE_BYTES) return failure('The library exceeds its combined source byte limit.');
    projects.push(copyProject({ name: item.name, modified: item.modified, workspace, activeFile: item.activeFile }));
  }
  projects.sort((a, b) => b.modified - a.modified || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  return { ok: true, value: { version: 1, projects } };
}

export function serializeLibrary(value: unknown): LibraryResult<string> {
  const checked = validateLibrary(value);
  if (!checked.ok) return checked;
  const raw = JSON.stringify(checked.value);
  return raw.length <= MAX_LIBRARY_JSON_BYTES && encoder.encode(raw).byteLength <= MAX_LIBRARY_JSON_BYTES
    ? { ok: true, value: raw } : failure('The serialized library exceeds its storage limit.');
}

export function parseLibrary(raw: unknown): LibraryResult<ProjectLibrary> {
  if (raw === null || raw === undefined) return { ok: true, value: emptyLibrary() };
  if (typeof raw !== 'string' || raw.length > MAX_LIBRARY_JSON_BYTES ||
      encoder.encode(raw).byteLength > MAX_LIBRARY_JSON_BYTES) {
    return failure('The stored project library is invalid or exceeds its size limit.');
  }
  try { return validateLibrary(JSON.parse(raw)); }
  catch { return failure('The stored project library is not valid JSON.'); }
}

export function captureLibraryProject(name: string, workspace: Workspace, activeFile: string,
  modified: number): LibraryResult<LibraryProject> {
  const checked = validateLibrary({ version: 1, projects: [{ name, workspace, activeFile, modified }] });
  return checked.ok ? { ok: true, value: checked.value.projects[0] } : checked;
}

export type LibraryMutation =
  | { kind: 'add'; project: LibraryProject }
  | { kind: 'replace'; name: string; project: LibraryProject }
  | { kind: 'rename'; name: string; nextName: string; modified: number }
  | { kind: 'delete'; name: string };

/** Pure, all-or-nothing change. Every mutation validates the entire result. */
export function mutateLibrary(current: ProjectLibrary, mutation: LibraryMutation): LibraryResult<ProjectLibrary> {
  const checked = validateLibrary(current);
  if (!checked.ok) return checked;
  const projects = checked.value.projects;
  if (mutation.kind === 'add') {
    if (projects.length === MAX_LIBRARY_PROJECTS) return failure('The library is full. Remove a project before adding another.');
    return validateLibrary({ version: 1, projects: [...projects, mutation.project] });
  }
  const index = projects.findIndex(item => item.name === mutation.name);
  if (index < 0) return failure('The selected saved project is no longer available.');
  if (mutation.kind === 'delete') return validateLibrary({ version: 1, projects: projects.filter((_, i) => i !== index) });
  if (mutation.kind === 'replace') {
    if (mutation.project.name !== mutation.name) return failure('Replacement must keep the existing saved project name.');
    projects[index] = mutation.project;
  } else {
    projects[index] = { ...projects[index], name: mutation.nextName, modified: mutation.modified };
  }
  return validateLibrary({ version: 1, projects });
}

export function projectMatchesEditor(project: LibraryProject, workspace: Workspace, activeFile: string): boolean {
  return project.activeFile === activeFile && sameWorkspaceContents(project.workspace, workspace);
}
