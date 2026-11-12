import { validateWorkspace, type Workspace } from './workspace';

export const MAX_REPLACE_QUERY = 96;
export const MAX_REPLACEMENT_LENGTH = 256;
export const MAX_REPLACE_SITES = 120;

export type ReplaceLine = {
  path: string;
  line: number;
  changes: number;
  before: string;
  after: string;
};

export type ReplacePlan =
  | { ok: true; workspace: Workspace; changes: number; changedFiles: string[]; lines: ReplaceLine[] }
  | { ok: false; error: string };

/**
 * Produce a complete, bounded and nonexecuting replacement preview.
 * This is literal text replacement, NOT compiler-backed symbol renaming.
 * Preserve original line separators and reject partial/oversized plans.
 */
export function previewProjectReplace(
  workspace: Workspace,
  query: string,
  replacement: string,
  matchCase = false,
): ReplacePlan {
  const problem = validateWorkspace(workspace);
  if (problem) return { ok: false, error: problem };
  if (query.length < 2 || query.length > MAX_REPLACE_QUERY || /[\r\n\0]/.test(query)) {
    return { ok: false, error: 'Find text must be 2–96 characters on one line.' };
  }
  if (replacement.length > MAX_REPLACEMENT_LENGTH || /[\r\n\0]/.test(replacement)) {
    return { ok: false, error: 'Replacement must be at most 256 characters on one line.' };
  }

  // Escaping the pattern and using a callback replacement ensures that both
  // the search and replacement are literal (including "$&" and backslashes).
  const expression = new RegExp(
    query.replace(/[.*+?^$()|[\]{}\\]/g, '\\$&'),
    matchCase ? 'gu' : 'giu',
  );
  const files: Record<string, string> = Object.create(null) as Record<string, string>;
  const changedFiles: string[] = [];
  const lines: ReplaceLine[] = [];
  let changes = 0;

  for (const path of Object.keys(workspace.files).sort()) {
    const original = workspace.files[path];
    // Capturing separators keeps CRLF, standalone CR and LF byte-for-byte.
    const fragments = original.split(/(\r\n|\r|\n)/);
    let fileChanges = 0;
    for (let index = 0; index < fragments.length; index += 2) {
      const before = fragments[index];
      let lineChanges = 0;
      const after = before.replace(expression, (matched) => {
        if (matched === replacement) return matched;
        lineChanges++;
        return replacement;
      });
      fragments[index] = after;
      if (!lineChanges) continue;
      changes += lineChanges;
      if (changes > MAX_REPLACE_SITES) {
        return { ok: false, error: 'More than 120 replacements. Narrow the search before applying changes.' };
      }
      fileChanges += lineChanges;
      lines.push({ path, line: index / 2 + 1, changes: lineChanges, before, after });
    }
    files[path] = fragments.join('');
    if (fileChanges) changedFiles.push(path);
  }

  if (!changes) return { ok: false, error: 'No source text would change.' };
  const nextWorkspace = { entry: workspace.entry, files };
  const nextProblem = validateWorkspace(nextWorkspace);
  if (nextProblem) return { ok: false, error: 'Replacement would exceed project limits: ' + nextProblem };
  return { ok: true, workspace: nextWorkspace, changes, changedFiles, lines };
}
