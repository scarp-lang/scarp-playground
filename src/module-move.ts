import { relativeImportPath } from './editor-completions';
import { validPath, validateWorkspace, type Workspace } from './workspace';

export const MAX_MODULE_MOVE_EDITS = 120;

export type ModuleMoveLine = {
  path: string;
  line: number;
  before: string;
  after: string;
  imports: number;
};
export type ModuleMovePlan =
  | { ok: true; from: string; to: string; workspace: Workspace;
      rewrittenImports: number; changedFiles: string[]; lines: ModuleMoveLine[] }
  | { ok: false; error: string };

type Token = { kind: 'word' | 'string' | 'punct'; text: string;
  start: number; end: number; depth: number };
type ImportPath = { start: number; end: number; specifier: string };

const letter = (char: string): boolean => /^[A-Za-z_]$/.test(char);
const wordChar = (char: string): boolean => /^[A-Za-z0-9_]$/.test(char);

/**
 * Ignore strings and // comments when locating top-level import declarations.
 * The scanner works in JS UTF-16 code-unit offsets, preserving all original
 * source bytes in every untouched span. Never perform global text replacement.
 */
function importPaths(source: string): ImportPath[] | null {
  const tokens: Token[] = [];
  let depth = 0;
  let offset = 0;
  while (offset < source.length) {
    const start = offset;
    const char = source[offset];
    if (/\s/.test(char)) { offset++; continue; }
    if (char === '/' && source[offset + 1] === '/') {
      offset += 2;
      while (offset < source.length && source[offset] !== '\r' && source[offset] !== '\n') offset++;
      continue;
    }
    if (char === '"') {
      offset++;
      const innerStart = offset;
      let closed = false;
      while (offset < source.length) {
        if (source[offset] === '\\') { offset += 2; continue; }
        if (source[offset] === '"') { closed = true; break; }
        offset++;
      }
      if (!closed) return null;
      const raw = source.slice(innerStart, offset);
      offset++;
      tokens.push({ kind: 'string', text: raw, start: innerStart, end: offset - 1, depth });
      continue;
    }
    if (letter(char)) {
      offset++;
      while (offset < source.length && wordChar(source[offset])) offset++;
      tokens.push({ kind: 'word', text: source.slice(start, offset), start, end: offset, depth });
      continue;
    }
    offset++;
    if (char === '}') depth--;
    if (depth < 0) return null;
    tokens.push({ kind: 'punct', text: char, start, end: offset, depth });
    if (char === '{') depth++;
  }
  if (depth !== 0) return null;

  const imports: ImportPath[] = [];
  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index];
    if (token.depth !== 0 || token.kind !== 'word' || token.text !== 'import' ||
        tokens[index + 1]?.kind !== 'string') continue;
    const path = tokens[index + 1];
    if (tokens[index + 2]?.text !== 'as' ||
        tokens[index + 3]?.kind !== 'word' ||
        tokens[index + 4]?.text !== ';') return null;
    imports.push({ start: path.start, end: path.end, specifier: path.text });
    index += 4;
  }
  return imports;
}

/** Match the pinned MemorySourceLoader's relative slash/.. normalization. */
export function resolveVirtualImport(importer: string, specifier: string): string | null {
  if (!validPath(importer) || !specifier.endsWith('.srp') ||
      specifier.startsWith('/') || specifier.includes('\\') ||
      specifier.includes(':') || specifier.includes('\0') ||
      specifier.split('/').some(segment => !segment ||
        (segment !== '.' && segment !== '..' && !/^[A-Za-z0-9_-]+(?:\.srp)?$/.test(segment)))) {
    return null;
  }
  const parts = importer.split('/').slice(0, -1);
  for (const part of specifier.split('/')) {
    if (part === '.') continue;
    if (part === '..') {
      if (!parts.length) return null;
      parts.pop();
    } else parts.push(part);
  }
  const resolved = parts.join('/');
  return validPath(resolved) ? resolved : null;
}

/**
 * Rename or move exactly one virtual .srp file, rebasing import paths where
 * needed. Only recognized top-level import strings are rewritten. All edits
 * are previewed and validated before any source graph is returned.
 */
export function previewModuleMove(
  workspace: Workspace,
  from: string,
  to: string,
): ModuleMovePlan {
  const invalid = validateWorkspace(workspace);
  if (invalid) return { ok: false, error: invalid };
  if (!validPath(from) || !Object.hasOwn(workspace.files, from)) {
    return { ok: false, error: 'Choose an existing .srp file to rename.' };
  }
  if (!validPath(to)) {
    return { ok: false, error: 'Choose a safe relative .srp path of at most 128 characters.' };
  }
  if (to === from || Object.hasOwn(workspace.files, to)) {
    return { ok: false, error: 'The destination must be a different unused .srp path.' };
  }

  const changedFiles: string[] = [];
  const lines: ModuleMoveLine[] = [];
  const files: Record<string, string> = Object.create(null) as Record<string, string>;
  let rewrittenImports = 0;

  for (const path of Object.keys(workspace.files).sort()) {
    const source = workspace.files[path];
    const sites = importPaths(source);
    if (!sites) {
      return { ok: false, error: 'Cannot safely inspect import syntax in ' + path +
        '. Fix the source before moving a module.' };
    }
    const newImporter = path === from ? to : path;
    const edits: Array<{ start: number; end: number; replacement: string }> = [];
    for (const site of sites) {
      const originalTarget = resolveVirtualImport(path, site.specifier);
      if (!originalTarget) {
        return { ok: false, error: 'Cannot safely resolve an import in ' + path +
          '. Use an ordinary relative .srp path.' };
      }
      const newTarget = originalTarget === from ? to : originalTarget;
      if (newImporter === path && newTarget === originalTarget) continue;
      const replacement = relativeImportPath(newImporter, newTarget);
      if (resolveVirtualImport(newImporter, replacement) !== newTarget) {
        return { ok: false, error: 'Could not preserve a relative import in ' + path + '.' };
      }
      if (replacement === site.specifier) continue;
      edits.push({ start: site.start, end: site.end, replacement });
      rewrittenImports++;
      if (rewrittenImports > MAX_MODULE_MOVE_EDITS) {
        return { ok: false, error: 'More than 120 import paths require updates. Narrow the workspace.' };
      }
    }

    let nextSource = source;
    for (const edit of [...edits].reverse()) {
      nextSource = nextSource.slice(0, edit.start) + edit.replacement +
        nextSource.slice(edit.end);
    }

    if (edits.length) {
      changedFiles.push(newImporter);
      const beforeLines = source.split(/\r\n|\r|\n/);
      const afterLines = nextSource.split(/\r\n|\r|\n/);
      const counts = new Map<number, number>();
      for (const edit of edits) {
        const line = source.slice(0, edit.start).split(/\r\n|\r|\n/).length;
        counts.set(line, (counts.get(line) ?? 0) + 1);
      }
      for (const [line, imports] of [...counts].sort((a, b) => a[0] - b[0])) {
        const before = beforeLines[line - 1];
        const after = afterLines[line - 1];
        if (before === undefined || after === undefined || before === after) {
          return { ok: false, error: 'Cannot build a complete import preview for ' + path + '.' };
        }
        lines.push({ path: newImporter, line, before, after, imports });
      }
    }
    files[newImporter] = nextSource;
  }
  const next = { entry: workspace.entry === from ? to : workspace.entry, files };
  const failure = validateWorkspace(next);
  if (failure) return { ok: false, error: 'Module move exceeds project limits: ' + failure };
  return { ok: true, from, to, workspace: next, rewrittenImports, changedFiles, lines };
}
