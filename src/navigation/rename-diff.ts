import type { Workspace } from '../workspace';
import { verifyRenameSnapshot, type RenameResult } from './rename';

export type RenameLineDiff = {
  line: number;
  before: string;
  after: string;
  sites: number;
};
export type RenameFileDiff = { path: string; lines: RenameLineDiff[] };
export type RenameDiff = { files: RenameFileDiff[]; changedLines: number };

/**
 * Scarp identifiers cannot contain newlines. Therefore every compiler edit
 * keeps the original line number, including in CRLF and Unicode sources.
 * Show every affected line: source and site counts are already bounded.
 */
export function buildRenameDiff(
  workspace: Workspace,
  answer: Extract<RenameResult, { ok: true }>,
): RenameDiff | null {
  if (!verifyRenameSnapshot(workspace, answer.new_name, answer).ok) return null;
  const encoder = new TextEncoder();
  const decoder = new TextDecoder('utf-8', { fatal: true });
  const files: RenameFileDiff[] = [];
  let changedLines = 0;
  try {
    for (const path of [...answer.changed_files].sort()) {
      const before = workspace.files[path];
      const after = answer.files[path];
      const oldLines = before.split(/\r\n|\r|\n/);
      const newLines = after.split(/\r\n|\r|\n/);
      if (oldLines.length !== newLines.length) return null;
      const bytes = encoder.encode(before);
      const occurrences = new Map<number, number>();
      for (const edit of answer.edits) {
        if (edit.path !== path) continue;
        const prefix = decoder.decode(bytes.subarray(0, edit.start));
        const line = prefix.split(/\r\n|\r|\n/).length;
        occurrences.set(line, (occurrences.get(line) ?? 0) + 1);
      }
      const lines = [...occurrences].sort(([a], [b]) => a - b)
        .map(([line, sites]) => ({
          line, sites, before: oldLines[line - 1], after: newLines[line - 1],
        }));
      if (lines.length === 0 || lines.some(row => row.before === row.after ||
          row.before === undefined || row.after === undefined)) return null;
      changedLines += lines.length;
      files.push({ path, lines });
    }
  } catch {
    return null;
  }
  return { files, changedLines };
}
