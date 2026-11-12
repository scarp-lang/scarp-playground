import { relativeImportPath } from './editor-completions';
import { importPaths, resolveVirtualImport } from './module-move';
import { MAX_FILES, validPath, validateWorkspace, type Workspace } from './workspace';

export const MAX_DUPLICATE_IMPORT_EDITS = 120;

export type DuplicateImportLine = {
  line: number;
  before: string;
  after: string;
  imports: number;
};

export type ModuleDuplicatePlan =
  | { ok: true; from: string; to: string; workspace: Workspace;
      rewrittenImports: number; lines: DuplicateImportLine[] }
  | { ok: false; error: string };

/** Suggest a noncolliding sibling name without modifying any workspace state. */
export function suggestDuplicatePath(workspace: Workspace, from: string): string | null {
  if (!validPath(from) || !Object.hasOwn(workspace.files, from) ||
      Object.keys(workspace.files).length >= MAX_FILES) return null;
  const stem = from.slice(0, -4);
  for (let index = 1; index <= MAX_FILES + 1; index++) {
    const candidate = stem + '_copy' + (index === 1 ? '' : index) + '.srp';
    if (validPath(candidate) && !Object.hasOwn(workspace.files, candidate)) return candidate;
  }
  return null;
}

/**
 * Clone an existing virtual Scarp file to a new path. Rebase *only the copy's*
 * top-level import path strings to continue resolving to the original modules.
 * All original sources, entrypoint and importers remain byte-for-byte intact.
 *
 * The preview is deterministic, bounded, client-only, and nonexecuting.
 */
export function previewModuleDuplicate(
  workspace: Workspace,
  from: string,
  to: string,
): ModuleDuplicatePlan {
  const invalid = validateWorkspace(workspace);
  if (invalid) return { ok: false, error: invalid };
  if (!validPath(from) || !Object.hasOwn(workspace.files, from)) {
    return { ok: false, error: 'Select an existing .srp source file to duplicate.' };
  }
  if (Object.keys(workspace.files).length >= MAX_FILES) {
    return { ok: false, error: 'A project supports at most ' + MAX_FILES + ' .srp files.' };
  }
  if (!validPath(to)) {
    return { ok: false, error: 'Choose a safe relative .srp path of at most 128 characters.' };
  }
  if (from === to || Object.hasOwn(workspace.files, to)) {
    return { ok: false, error: 'Choose a different unused destination .srp path.' };
  }

  const source = workspace.files[from];
  const sites = importPaths(source);
  if (!sites) {
    return { ok: false, error: 'The original module has ambiguous import syntax. Fix it before copying.' };
  }

  const edits: Array<{ start: number; end: number; replacement: string }> = [];
  for (const site of sites) {
    const resolved = resolveVirtualImport(from, site.specifier);
    if (!resolved || !Object.hasOwn(workspace.files, resolved)) {
      return { ok: false, error: 'An import cannot be resolved within the workspace. Correct its path first.' };
    }
    const suggested = relativeImportPath(to, resolved);
    if (resolveVirtualImport(to, suggested) !== resolved) {
      return { ok: false, error: 'Cannot safely rebase the import into the duplicate file.' };
    }
    // Preserve unchanged original spellings (such as ./math.srp) when
    // copying within the same directory, even if normalization differs.
    if (resolveVirtualImport(to, site.specifier) === resolved) continue;
    edits.push({ start: site.start, end: site.end, replacement: suggested });
    if (edits.length > MAX_DUPLICATE_IMPORT_EDITS) {
      return { ok: false, error: 'More than 120 copied imports require rebasing.' };
    }
  }

  let duplicated = source;
  for (const edit of [...edits].reverse()) {
    duplicated = duplicated.slice(0, edit.start) + edit.replacement +
      duplicated.slice(edit.end);
  }

  const lines: DuplicateImportLine[] = [];
  if (edits.length) {
    const beforeLines = source.split(/\r\n|\r|\n/);
    const afterLines = duplicated.split(/\r\n|\r|\n/);
    const counts = new Map<number, number>();
    for (const edit of edits) {
      const line = source.slice(0, edit.start).split(/\r\n|\r|\n/).length;
      counts.set(line, (counts.get(line) ?? 0) + 1);
    }
    for (const [line, imports] of [...counts].sort((a, b) => a[0] - b[0])) {
      const before = beforeLines[line - 1];
      const after = afterLines[line - 1];
      if (before === undefined || after === undefined || before === after) {
        return { ok: false, error: 'Cannot produce a complete preview of the copied import statements.' };
      }
      lines.push({ line, before, after, imports });
    }
  }

  const files: Record<string, string> = Object.create(null) as Record<string, string>;
  for (const path of Object.keys(workspace.files).sort()) files[path] = workspace.files[path];
  files[to] = duplicated;
  const next = { entry: workspace.entry, files };
  const invalidNext = validateWorkspace(next);
  if (invalidNext) {
    return { ok: false, error: 'Cannot duplicate the source within workspace limits: ' + invalidNext };
  }
  return { ok: true, from, to, workspace: next,
    rewrittenImports: edits.length, lines };
}
