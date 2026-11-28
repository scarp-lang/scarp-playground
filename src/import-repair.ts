import { relativeImportPath } from './editor-completions';
import { importPaths, resolveVirtualImport } from './module-move';
import { inspectModuleGraph } from './module-graph';
import { createBulkEditUndo, type BulkEditUndo } from './bulk-undo';
import { validPath, validateWorkspace, type Workspace } from './workspace';

export const MAX_IMPORT_REPAIR_CHOICES = 40;
export const MAX_IMPORT_REPAIR_SUGGESTIONS = 8;

export type MissingImportSite = Readonly<{
  id: string;
  importer: string;
  attemptedPath: string;
  specifier: string;
  start: number;
  end: number;
  line: number;
  column: number;
  suggestions: string[];
}>;
export type ImportRepairInspection =
  | { ok: true; missing: MissingImportSite[]; invalid: number;
      incomplete: boolean; files: string[] }
  | { ok: false; error: string };

export type ImportRepairSelection = Readonly<{
  id: string;
  target: string;
}>;

export type ImportRepairEdit = Readonly<{
  id: string;
  importer: string;
  line: number;
  oldSpecifier: string;
  newSpecifier: string;
  target: string;
}>;
export type ImportRepairLine = Readonly<{
  path: string;
  line: number;
  before: string;
  after: string;
  edits: number;
}>;
export type ImportRepairPlan =
  | { ok: true; workspace: Workspace; edits: ImportRepairEdit[];
      changedFiles: string[]; lines: ImportRepairLine[];
      remainingMissing: number; originalEntry: string }
  | { ok: false; error: string };

const fail = (error: string): ImportRepairPlan => ({ ok: false, error });

function location(source: string, offset: number): { line: number; column: number } {
  let line = 1, start = 0;
  for (let index = 0; index < offset; index++) {
    if (source[index] === '\r') {
      if (source[index + 1] === '\n' && index + 1 < offset) index++;
      line++;
      start = index + 1;
    } else if (source[index] === '\n') {
      line++;
      start = index + 1;
    }
  }
  return { line, column: offset - start + 1 };
}

function basename(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1);
}

function nameScore(candidate: string, missingPath: string): number {
  const file = basename(candidate), expected = basename(missingPath);
  if (file === expected) return 0;
  const withoutExtension = (value: string) => value.replace(/\.srp$/, '').toLocaleLowerCase();
  if (withoutExtension(file) === withoutExtension(expected)) return 1;
  if (withoutExtension(file).includes(withoutExtension(expected)) ||
      withoutExtension(expected).includes(withoutExtension(file))) return 2;
  return 3;
}

function orderSuggestions(
  importer: string, target: string, paths: readonly string[],
): string[] {
  return paths.filter(path => path !== importer).sort((a, b) =>
    nameScore(a, target) - nameScore(b, target) ||
    a.localeCompare(b, 'en')).slice(0, MAX_IMPORT_REPAIR_SUGGESTIONS);
}

function idFor(importer: string, start: number, specifier: string): string {
  return JSON.stringify([importer, start, specifier]);
}

/**
 * Pure local inventory of missing import statements.
 * Existing and unparseable imports are not automatically changed.
 * A candidate path is a suggestion only; no heuristic target is applied.
 */
export function inspectMissingImports(workspace: Workspace): ImportRepairInspection {
  const invalid = validateWorkspace(workspace);
  if (invalid) return { ok: false, error: invalid };
  const graph = inspectModuleGraph(workspace);
  if (graph.issues.length && !graph.complete) {
    return { ok: false,
      error: 'The import scan is incomplete. Repair syntax or reduce import count before refactoring.' };
  }
  const paths = Object.keys(workspace.files).sort();
  const missing: MissingImportSite[] = [];
  let invalidCount = 0;
  for (const node of graph.nodes) {
    const source = workspace.files[node.path];
    const sites = importPaths(source);
    if (!sites) {
      return { ok: false, error: 'Cannot safely parse source imports in ' + node.path + '.' };
    }
    for (const site of sites) {
      const attemptedPath = resolveVirtualImport(node.path, site.specifier);
      if (!attemptedPath) { invalidCount++; continue; }
      if (Object.hasOwn(workspace.files, attemptedPath)) continue;
      if (missing.length >= MAX_IMPORT_REPAIR_CHOICES) {
        return { ok: false, error: 'More than 40 missing import sites. Narrow the workspace.' };
      }
      missing.push({
        id: idFor(node.path, site.start, site.specifier),
        importer: node.path, attemptedPath, specifier: site.specifier,
        start: site.start, end: site.end, ...location(source, site.start),
        suggestions: orderSuggestions(node.path, attemptedPath, paths),
      });
    }
  }
  return { ok: true, missing, invalid: invalidCount, incomplete: !graph.complete, files: paths };
}

/**
 * Only modify explicitly selected missing string-literal spans. Validate
 * each old source site and its new resolution independently, then reject any
 * partial or invalid projected workspace.
 */
export function previewImportRepairs(
  workspace: Workspace, selections: readonly ImportRepairSelection[],
): ImportRepairPlan {
  const invalid = validateWorkspace(workspace);
  if (invalid) return fail(invalid);
  const inspected = inspectMissingImports(workspace);
  if (!inspected.ok) return fail(inspected.error);
  if (!Array.isArray(selections) || !selections.length ||
      selections.length > MAX_IMPORT_REPAIR_CHOICES) {
    return fail('Select between one and 40 missing imports to repair.');
  }
  const known = new Map(inspected.missing.map(item => [item.id, item]));
  const selected = new Map<string, string>();
  for (const choice of selections) {
    if (!choice || typeof choice.id !== 'string' || !known.has(choice.id) ||
        !validPath(choice.target) ||
        !Object.hasOwn(workspace.files, choice.target) || selected.has(choice.id)) {
      return fail('A repair selection is duplicated, stale, or targets an invalid module.');
    }
    const item = known.get(choice.id)!;
    if (choice.target === item.importer) {
      return fail('A missing import cannot be automatically repaired to import itself.');
    }
    selected.set(choice.id, choice.target);
  }

  const files: Record<string, string> = Object.create(null) as Record<string, string>;
  const edits: ImportRepairEdit[] = [];
  const previewLines: ImportRepairLine[] = [];
  const changedFiles: string[] = [];
  for (const importer of inspected.files) {
    const source = workspace.files[importer];
    const sites = importPaths(source);
    if (!sites) return fail('The source changed during import inspection.');
    const substitutions: Array<{ from: number; to: number; next: string }> = [];
    const counts = new Map<number, number>();
    for (const site of sites) {
      const id = idFor(importer, site.start, site.specifier);
      const target = selected.get(id);
      if (!target) continue;
      const oldTarget = resolveVirtualImport(importer, site.specifier);
      if (!oldTarget || Object.hasOwn(workspace.files, oldTarget)) {
        return fail('The selected import no longer has a missing target.');
      }
      const replacement = relativeImportPath(importer, target);
      if (resolveVirtualImport(importer, replacement) !== target ||
          replacement === site.specifier) {
        return fail('Cannot safely create a different resolving local import.');
      }
      const place = location(source, site.start);
      substitutions.push({ from: site.start, to: site.end, next: replacement });
      counts.set(place.line, (counts.get(place.line) ?? 0) + 1);
      edits.push({
        id, importer, line: place.line,
        oldSpecifier: site.specifier, newSpecifier: replacement, target,
      });
    }
    let result = source;
    for (const patch of [...substitutions].reverse()) {
      result = result.slice(0, patch.from) + patch.next + result.slice(patch.to);
    }
    files[importer] = result;
    if (!substitutions.length) continue;
    changedFiles.push(importer);
    const oldLines = source.split(/\r\n|\r|\n/);
    const newLines = result.split(/\r\n|\r|\n/);
    for (const [line, count] of [...counts].sort((a, b) => a[0] - b[0])) {
      const before = oldLines[line - 1], after = newLines[line - 1];
      if (before === undefined || after === undefined || before === after) {
        return fail('Cannot build a complete changed-import preview for ' + importer + '.');
      }
      previewLines.push({ path: importer, line, before, after, edits: count });
    }
  }
  if (edits.length !== selected.size || !changedFiles.length) {
    return fail('One or more chosen import sites were not found.');
  }
  const next: Workspace = { entry: workspace.entry, files };
  const failure = validateWorkspace(next);
  if (failure) return fail('Import repair exceeds workspace limits: ' + failure);
  // The generated literal must resolve exactly to each selected source file
  // after all edits; no entrypoint or existing module path may change.
  for (const edit of edits) {
    if (resolveVirtualImport(edit.importer, edit.newSpecifier) !== edit.target) {
      return fail('Generated import no longer targets the selected module.');
    }
  }
  return {
    ok: true, workspace: next, originalEntry: workspace.entry,
    edits, changedFiles, lines: previewLines,
    remainingMissing: inspected.missing.length - edits.length,
  };
}

/** Recompute against the original snapshot before issuing a one-step undo. */
export function createImportRepairUndo(
  before: Workspace, plan: ImportRepairPlan,
): BulkEditUndo | null {
  if (!plan.ok || validateWorkspace(before)) return null;
  const replay = previewImportRepairs(before, plan.edits.map(edit => ({
    id: edit.id, target: edit.target,
  })));
  if (!replay.ok || plan.workspace.entry !== replay.workspace.entry) return null;
  const keys = Object.keys(replay.workspace.files).sort();
  const candidate = Object.keys(plan.workspace.files).sort();
  if (keys.length !== candidate.length ||
      keys.some((name, index) => name !== candidate[index] ||
        replay.workspace.files[name] !== plan.workspace.files[name])) return null;
  return createBulkEditUndo(before, plan.workspace, 'import repair');
}
