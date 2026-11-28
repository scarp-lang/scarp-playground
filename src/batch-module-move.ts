import { importPaths, previewPathMoves, resolveVirtualImport, type ModuleMoveLine } from './module-move';
import { MAX_FILES, validPath, validateWorkspace, type Workspace } from './workspace';
import type { BulkEditUndo } from './bulk-undo';

export const MAX_BATCH_MOVE_FILES = MAX_FILES;
export const MAX_BATCH_IMPORT_EDITS = 120;

export type BatchMoveEntry = Readonly<{ from: string; to: string }>;
export type BatchMoveVerification = Readonly<{
  importer: string;
  nextImporter: string;
  oldTarget: string;
  nextTarget: string;
  specifierBefore: string;
  specifierAfter: string;
}>;

export type BatchMovePlan =
  | { ok: true; workspace: Workspace; moves: BatchMoveEntry[];
      nextActiveFile: string; changedFiles: string[];
      rewrittenImports: number; lines: ModuleMoveLine[];
      verifiedReferences: BatchMoveVerification[];
      totalFiles: number }
  | { ok: false; error: string };

/** Defensive display-only progress, not an authority for source modification. */
export type BatchMoveSummary = Readonly<{
  moved: number;
  imports: number;
  touched: number;
  entryChanged: boolean;
  activeFileChanged: boolean;
}>;

const fail = (error: string): BatchMovePlan => ({ ok: false, error });

function normalizedRows(
  workspace: Workspace, rows: readonly BatchMoveEntry[],
): { moves: BatchMoveEntry[]; map: Map<string, string> } | { error: string } {
  if (!Array.isArray(rows) || rows.length === 0 || rows.length > MAX_BATCH_MOVE_FILES) {
    return { error: 'Choose between one and 12 existing source-file mappings.' };
  }
  const existing = new Set(Object.keys(workspace.files));
  const origins = new Set<string>();
  const destinations = new Set<string>();
  const moves: BatchMoveEntry[] = [];
  for (const row of rows) {
    if (!row || !validPath(row.from) || !existing.has(row.from)) {
      return { error: 'Every batch move must originate from an existing .srp file.' };
    }
    if (origins.has(row.from)) return { error: 'A source file cannot be included more than once.' };
    origins.add(row.from);
    if (!validPath(row.to)) {
      return { error: 'Each destination must be a valid relative .srp path of at most 128 characters.' };
    }
    if (row.from === row.to) continue;
    if (destinations.has(row.to)) {
      return { error: 'Two source files cannot share the same destination path.' };
    }
    destinations.add(row.to);
    moves.push({ from: row.from, to: row.to });
  }

  if (!moves.length) return { error: 'Select at least one actual filename change.' };
  // Unchanged existing source paths must remain available; rename collisions
  // and swaps are checked simultaneously, never by an unsafe sequential edit.
  const map = new Map(moves.map(row => [row.from, row.to]));
  const afterPaths = [...existing].map(path => map.get(path) ?? path);
  if (new Set(afterPaths).size !== afterPaths.length) {
    return { error: 'A destination would overwrite an unmoved source file.' };
  }
  return { moves: moves.sort((a, b) => a.from.localeCompare(b.from, 'en')), map };
}

/**
 * A lexical import identity audit after simultaneous relocation.
 * The existing module-move planner performs the textual rewriting. This
 * independent verification proves that every recognized resolved import
 * still addresses the intended target in the *new* virtual file tree.
 */
function verifyImportIdentities(
  before: Workspace, after: Workspace, map: ReadonlyMap<string, string>,
): BatchMoveVerification[] | null {
  const relations: BatchMoveVerification[] = [];
  for (const path of Object.keys(before.files).sort()) {
    const nextPath = map.get(path) ?? path;
    const originalSites = importPaths(before.files[path]);
    const changedSites = importPaths(after.files[nextPath]);
    if (!originalSites || !changedSites || originalSites.length !== changedSites.length) return null;
    for (let index = 0; index < originalSites.length; index++) {
      const old = originalSites[index];
      const current = changedSites[index];
      const oldTarget = resolveVirtualImport(path, old.specifier);
      const newTarget = resolveVirtualImport(nextPath, current.specifier);
      if (!oldTarget || !newTarget ||
          !Object.hasOwn(before.files, oldTarget) ||
          !Object.hasOwn(after.files, newTarget) ||
          newTarget !== (map.get(oldTarget) ?? oldTarget)) return null;
      relations.push({
        importer: path, nextImporter: nextPath, oldTarget, nextTarget: newTarget,
        specifierBefore: old.specifier, specifierAfter: current.specifier,
      });
      if (relations.length > MAX_BATCH_IMPORT_EDITS) return null;
    }
  }
  return relations;
}

/**
 * Simultaneously rename multiple .srp files and rebase their imports.
 * No source mutation, filesystem operation, compilation, persistence, or
 * network transfer occurs during planning. Explicit user confirmation is
 * required before applying the preview in App.
 */
export function previewBatchModuleMove(
  workspace: Workspace, rows: readonly BatchMoveEntry[], activeFile: string,
): BatchMovePlan {
  const invalid = validateWorkspace(workspace);
  if (invalid) return fail(invalid);
  if (!validPath(activeFile) || !Object.hasOwn(workspace.files, activeFile)) {
    return fail('Select a valid active source before preparing the move.');
  }
  const validated = normalizedRows(workspace, rows);
  if ('error' in validated) return fail(validated.error);
  // Disallow moving modules while imports are missing/ambiguous. This is
  // stricter than single-file move, because batch renaming has higher impact.
  const planned = previewPathMoves(workspace, validated.map, true);
  if (!planned.ok) return fail(planned.error);
  const verifiedReferences = verifyImportIdentities(workspace, planned.workspace, validated.map);
  if (!verifiedReferences) {
    return fail('Cannot prove that all existing local imports still resolve to the same modules.');
  }
  const nextActiveFile = validated.map.get(activeFile) ?? activeFile;
  if (!Object.hasOwn(planned.workspace.files, nextActiveFile)) {
    return fail('Cannot retain the selected active file after moving sources.');
  }
  const movedPaths = validated.moves.map(row => row.to);
  const changedFiles = [...new Set([...movedPaths, ...planned.changedFiles])].sort();
  return {
    ok: true, workspace: planned.workspace, moves: validated.moves,
    nextActiveFile, changedFiles, rewrittenImports: planned.rewrittenImports,
    lines: planned.lines, verifiedReferences, totalFiles: Object.keys(workspace.files).length,
  };
}

export function summarizeBatchModuleMove(
  before: Workspace, plan: BatchMovePlan,
): BatchMoveSummary | null {
  if (!plan.ok || validateWorkspace(before)) return null;
  return {
    moved: plan.moves.length,
    imports: plan.rewrittenImports,
    touched: plan.changedFiles.length,
    entryChanged: before.entry !== plan.workspace.entry,
    activeFileChanged: plan.moves.some(move => move.to === plan.nextActiveFile),
  };
}

/**
 * Recompute on the exact original snapshot, never trust a forged preview.
 * Build an existing one-step workspace undo token with an explicit label.
 */
export function prepareBatchMoveUndo(
  before: Workspace, activeFile: string, plan: BatchMovePlan,
): BulkEditUndo | null {
  if (!plan.ok || validateWorkspace(before)) return null;
  const replay = previewBatchModuleMove(before, plan.moves, activeFile);
  if (!replay.ok || replay.workspace.entry !== plan.workspace.entry ||
      replay.nextActiveFile !== plan.nextActiveFile) return null;
  const keys = Object.keys(replay.workspace.files).sort();
  const plannedKeys = Object.keys(plan.workspace.files).sort();
  if (keys.length !== plannedKeys.length || keys.some((path, index) =>
      path !== plannedKeys[index] || replay.workspace.files[path] !== plan.workspace.files[path])) return null;
  return {
    before, after: plan.workspace, label: 'batch module move', restoreActiveFile: activeFile,
  };
}

/** Display only, independent of source values. */
export function describeBatchModuleMove(plan: BatchMovePlan): string {
  if (!plan.ok) return plan.error;
  const details = [
    plan.moves.length + ' file(s) moved',
    plan.rewrittenImports + ' import(s) rebased',
    plan.changedFiles.length + ' file(s) touched',
    plan.verifiedReferences.length + ' local imports independently verified',
  ];
  return details.join(' · ');
}
