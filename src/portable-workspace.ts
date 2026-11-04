import { validateWorkspace, type Workspace } from './workspace';

// Portable, human-readable source-only format. This file is never uploaded
// or evaluated; imports must pass the same limits as browser execution.
export const PORTABLE_WORKSPACE_FORMAT = 'scarp-playground-workspace';
export const PORTABLE_WORKSPACE_VERSION = 1;
export const MAX_PORTABLE_WORKSPACE_BYTES = 160 * 1024;

export type PortableWorkspace = { workspace: Workspace; activeFile: string };

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function serializePortableWorkspace(
  workspace: Workspace,
  activeFile: string,
): string | null {
  if (validateWorkspace(workspace)) return null;
  const sortedFiles: Record<string, string> = Object.create(null) as Record<string, string>;
  for (const path of Object.keys(workspace.files).sort()) {
    sortedFiles[path] = workspace.files[path];
  }
  const serialized = JSON.stringify({
    format: PORTABLE_WORKSPACE_FORMAT,
    version: PORTABLE_WORKSPACE_VERSION,
    workspace: { entry: workspace.entry, files: sortedFiles },
    activeFile: Object.hasOwn(workspace.files, activeFile) ? activeFile : workspace.entry,
  });
  return new TextEncoder().encode(serialized).byteLength <= MAX_PORTABLE_WORKSPACE_BYTES
    ? serialized + '\n'
    : null;
}

export function parsePortableWorkspace(raw: string): PortableWorkspace | null {
  if (!raw || new TextEncoder().encode(raw).byteLength > MAX_PORTABLE_WORKSPACE_BYTES) return null;
  try {
    const data: unknown = JSON.parse(raw);
    if (
      !record(data) ||
      data.format !== PORTABLE_WORKSPACE_FORMAT ||
      data.version !== PORTABLE_WORKSPACE_VERSION ||
      !record(data.workspace) ||
      typeof data.workspace.entry !== 'string' ||
      !record(data.workspace.files)
    ) return null;

    // Construct a clean map, never trusting object prototypes, file contents
    // or metadata from imported JSON. Do not execute or fetch anything.
    const files: Record<string, string> = Object.create(null) as Record<string, string>;
    for (const [path, source] of Object.entries(data.workspace.files)) {
      if (typeof source !== 'string') return null;
      files[path] = source;
    }
    const workspace: Workspace = { entry: data.workspace.entry, files };
    if (validateWorkspace(workspace)) return null;
    const activeFile = typeof data.activeFile === 'string' && Object.hasOwn(files, data.activeFile)
      ? data.activeFile
      : workspace.entry;
    return { workspace, activeFile };
  } catch {
    return null;
  }
}
