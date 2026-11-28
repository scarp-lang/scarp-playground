import { findAdvancedLiteral } from './advanced-source-search';
import { isUtf8Text } from './utf8';
import { createBulkEditUndo, type BulkEditUndo } from './bulk-undo';
import { validateWorkspace, validPath, type Workspace } from './workspace';

export const MAX_SELECTIVE_FIND_BYTES = 192;
export const MAX_SELECTIVE_REPLACE_BYTES = 512;
export const MAX_SELECTIVE_SITES = 160;
export const MAX_SELECTIVE_PREVIEW_LINES = 160;
export const MAX_SELECTIVE_PREVIEW_CHARS = 280;

export type SelectiveSearch = Readonly<{
  query: string;
  replacement: string;
  caseSensitive: boolean;
  wholeWord: boolean;
  path: string | 'all';
}>;

export type SelectiveSite = Readonly<{
  id: string;
  path: string;
  line: number;
  column: number;
  endColumn: number;
  offset: number;
  length: number;
  matchedText: string;
  lineText: string;
}>;

export type SelectiveScan =
  | { ok: true; sites: SelectiveSite[]; files: string[];
      truncated: boolean; scannedFiles: number; scannedLines: number }
  | { ok: false; error: string };

export type SelectivePreviewLine = Readonly<{
  path: string;
  line: number;
  before: string;
  after: string;
  replacements: number;
  excerptTruncated: boolean;
}>;

export type SelectiveEdit = Readonly<{
  id: string;
  path: string;
  line: number;
  column: number;
  before: string;
  after: string;
}>;

export type SelectivePlan =
  | { ok: true; workspace: Workspace; edits: SelectiveEdit[];
      changedFiles: string[]; lines: SelectivePreviewLine[];
      replacementCount: number; totalMatches: number; leftUnchanged: number }
  | { ok: false; error: string };

type PhysicalLine = Readonly<{ text: string; start: number; number: number }>;
const fail = (error: string): SelectivePlan => ({ ok: false, error });

function validOptions(options: unknown): options is SelectiveSearch {
  if (!options || typeof options !== 'object' || Array.isArray(options)) return false;
  const item = options as Record<string, unknown>;
  return typeof item.query === 'string' &&
    isUtf8Text(item.query, MAX_SELECTIVE_FIND_BYTES) &&
    item.query.length >= 2 && !/[\r\n\0]/.test(item.query) &&
    typeof item.replacement === 'string' &&
    isUtf8Text(item.replacement, MAX_SELECTIVE_REPLACE_BYTES) &&
    !/[\r\n\0]/.test(item.replacement) &&
    typeof item.caseSensitive === 'boolean' &&
    typeof item.wholeWord === 'boolean' &&
    (item.path === 'all' || validPath(item.path));
}

export function sourceLinesWithOffsets(text: string): PhysicalLine[] {
  const lines: PhysicalLine[] = [];
  let start = 0;
  let line = 1;
  for (let cursor = 0; cursor < text.length; cursor++) {
    if (text[cursor] !== '\r' && text[cursor] !== '\n') continue;
    lines.push({ text: text.slice(start, cursor), start, number: line++ });
    if (text[cursor] === '\r' && text[cursor + 1] === '\n') cursor++;
    start = cursor + 1;
  }
  lines.push({ text: text.slice(start), start, number: line });
  return lines;
}

function siteKey(path: string, offset: number, match: string): string {
  // IDs deliberately contain the actual matched literal and location.
  // No externally supplied offset is trusted without a fresh rescan.
  return JSON.stringify([path, offset, match]);
}

/**
 * Read-only literal search through bounded local .srp files.
 *
 * It deliberately searches comments and strings too. This is not a compiler
 * semantic rename. Never use it to prove symbol relationships.
 */
export function scanSelectiveReplacement(
  workspace: Workspace, options: SelectiveSearch,
): SelectiveScan {
  const problem = validateWorkspace(workspace);
  if (problem) return { ok: false, error: problem };
  if (!validOptions(options)) {
    return { ok: false, error: 'Enter a valid single-line literal find/replace expression.' };
  }
  if (options.path !== 'all' && !Object.hasOwn(workspace.files, options.path)) {
    return { ok: false, error: 'The selected Scarp source file is missing.' };
  }
  const paths = options.path === 'all'
    ? Object.keys(workspace.files).sort() : [options.path];
  const sites: SelectiveSite[] = [];
  let truncated = false;
  let scannedFiles = 0;
  let scannedLines = 0;
  outer: for (const path of paths) {
    scannedFiles++;
    for (const line of sourceLinesWithOffsets(workspace.files[path])) {
      scannedLines++;
      const matches = findAdvancedLiteral(
        line.text, options.query, options.caseSensitive, options.wholeWord,
        MAX_SELECTIVE_SITES + 1,
      );
      for (const match of matches) {
        if (sites.length >= MAX_SELECTIVE_SITES) {
          truncated = true;
          break outer;
        }
        const matchedText = line.text.slice(match.start, match.end);
        const offset = line.start + match.start;
        sites.push({
          id: siteKey(path, offset, matchedText),
          path, line: line.number,
          column: match.start + 1,
          endColumn: match.end + 1,
          offset, length: match.end - match.start,
          matchedText, lineText: line.text,
        });
      }
    }
  }
  return { ok: true, sites, truncated, files: paths, scannedFiles, scannedLines };
}

function excerpt(line: string): { value: string; truncated: boolean } {
  if (line.length <= MAX_SELECTIVE_PREVIEW_CHARS) {
    return { value: line, truncated: false };
  }
  let end = MAX_SELECTIVE_PREVIEW_CHARS;
  const before = line.charCodeAt(end - 1);
  if (before >= 0xd800 && before <= 0xdbff) end--;
  return { value: line.slice(0, end) + '…', truncated: true };
}

function projectedWorkspace(
  source: Workspace, nextFiles: Record<string, string>,
): Workspace {
  return { entry: source.entry, files: nextFiles };
}

/**
 * Every edit is selected by a site ID from a fresh exact scan. Applies edits
 * from right to left to preserve pre-edit UTF-16 offsets, then validates all
 * source size limits atomically. A failed plan never returns partial sources.
 */
export function previewSelectiveReplacement(
  workspace: Workspace, options: SelectiveSearch, chosenIds: readonly string[],
): SelectivePlan {
  const scan = scanSelectiveReplacement(workspace, options);
  if (!scan.ok) return fail(scan.error);
  if (scan.truncated) return fail('Too many matches. Narrow the query or source file.');
  if (!Array.isArray(chosenIds) || !chosenIds.length ||
      chosenIds.length > MAX_SELECTIVE_SITES) {
    return fail('Select between one and 160 source matches.');
  }
  const known = new Map(scan.sites.map(site => [site.id, site]));
  const selected = new Set<string>();
  for (const id of chosenIds) {
    if (typeof id !== 'string' || !known.has(id) || selected.has(id)) {
      return fail('The selected match was duplicated, changed, or no longer exists.');
    }
    selected.add(id);
  }
  const nextFiles: Record<string, string> = Object.create(null) as Record<string, string>;
  const edits: SelectiveEdit[] = [];
  const changedFiles: string[] = [];
  const previews: SelectivePreviewLine[] = [];
  const byFile = new Map<string, SelectiveSite[]>();
  for (const site of scan.sites) {
    if (!selected.has(site.id)) continue;
    const bucket = byFile.get(site.path) ?? [];
    bucket.push(site);
    byFile.set(site.path, bucket);
  }

  for (const path of Object.keys(workspace.files).sort()) {
    const source = workspace.files[path];
    const matches = byFile.get(path) ?? [];
    if (!matches.length) {
      nextFiles[path] = source;
      continue;
    }
    const ordered = [...matches].sort((a, b) => a.offset - b.offset);
    let previousEnd = -1;
    for (const site of ordered) {
      if (site.offset < previousEnd ||
          source.slice(site.offset, site.offset + site.length) !== site.matchedText) {
        return fail('Selected source ranges overlap or no longer match the source.');
      }
      previousEnd = site.offset + site.length;
    }
    let rewritten = source;
    for (const site of ordered.reverse()) {
      rewritten = rewritten.slice(0, site.offset) + options.replacement +
        rewritten.slice(site.offset + site.length);
      edits.push({
        id: site.id, path, line: site.line, column: site.column,
        before: site.matchedText, after: options.replacement,
      });
    }
    nextFiles[path] = rewritten;
    if (rewritten === source) continue;
    changedFiles.push(path);

    const beforeLines = sourceLinesWithOffsets(source);
    const afterLines = sourceLinesWithOffsets(rewritten);
    if (beforeLines.length !== afterLines.length) {
      return fail('A single-line replacement unexpectedly changed the number of source lines.');
    }
    const counts = new Map<number, number>();
    for (const site of matches) counts.set(site.line, (counts.get(site.line) ?? 0) + 1);
    for (const [line, amount] of [...counts].sort((a, b) => a[0] - b[0])) {
      const before = beforeLines[line - 1], after = afterLines[line - 1];
      if (!before || !after || before.text === after.text) continue;
      const oldPreview = excerpt(before.text), newPreview = excerpt(after.text);
      previews.push({
        path, line, before: oldPreview.value, after: newPreview.value,
        replacements: amount,
        excerptTruncated: oldPreview.truncated || newPreview.truncated,
      });
    }
  }

  if (!changedFiles.length) return fail('Selections produced no source changes.');
  if (previews.length > MAX_SELECTIVE_PREVIEW_LINES) {
    return fail('The edit preview exceeds its line limit; narrow the selections.');
  }
  const candidate = projectedWorkspace(workspace, nextFiles);
  const problem = validateWorkspace(candidate);
  if (problem) return fail('Replacement would exceed the Scarp workspace limits: ' + problem);
  edits.sort((a, b) => a.path.localeCompare(b.path) || a.line - b.line || a.column - b.column);
  return {
    ok: true, workspace: candidate, edits, changedFiles,
    lines: previews, replacementCount: edits.length,
    totalMatches: scan.sites.length, leftUnchanged: scan.sites.length - edits.length,
  };
}

/** Reject forged plans: the exact selected textual transformation must replay. */
export function verifySelectiveUndo(
  before: Workspace, options: SelectiveSearch, plan: SelectivePlan,
): BulkEditUndo | null {
  if (!plan.ok || validateWorkspace(before)) return null;
  const replica = previewSelectiveReplacement(before, options, plan.edits.map(edit => edit.id));
  if (!replica.ok || replica.workspace.entry !== plan.workspace.entry) return null;
  const paths = Object.keys(replica.workspace.files).sort();
  const proposal = Object.keys(plan.workspace.files).sort();
  if (paths.length !== proposal.length ||
      paths.some((path, index) => path !== proposal[index] ||
        replica.workspace.files[path] !== plan.workspace.files[path])) return null;
  return createBulkEditUndo(before, plan.workspace, 'selective replacement');
}
