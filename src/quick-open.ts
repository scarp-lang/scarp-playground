import { validPath } from './workspace';

export const MAX_QUICK_OPEN_QUERY = 128;

export type QuickFileHit = {
  path: string;
  name: string;
  directory: string;
  entry: boolean;
};

/** Deterministic, bounded, offline file-path search for a 12-file workspace. */
export function quickOpenFiles(paths: string[], query: string, entry: string): QuickFileHit[] {
  if (query.length > MAX_QUICK_OPEN_QUERY) return [];
  const needle = query.trim().replace(/\\/g, '/').toLowerCase();
  const hits: Array<QuickFileHit & { rank: number }> = [];

  for (const path of [...new Set(paths)]) {
    if (!validPath(path)) continue;
    const segments = path.split('/');
    const name = segments[segments.length - 1];
    const directory = segments.slice(0, -1).join('/');
    const lowerPath = path.toLowerCase();
    const lowerName = name.toLowerCase();
    let rank: number;

    if (!needle) rank = path === entry ? -1 : 0;
    else if (lowerName === needle || lowerPath === needle) rank = 0;
    else if (lowerName.startsWith(needle)) rank = 1;
    else if (lowerPath.startsWith(needle)) rank = 2;
    else if (lowerName.includes(needle)) rank = 3;
    else if (lowerPath.includes(needle)) rank = 4;
    else continue;

    hits.push({ path, name, directory, entry: path === entry, rank });
  }

  hits.sort((a, b) => a.rank - b.rank || a.path.localeCompare(b.path, 'en'));
  return hits.map(({ path, name, directory, entry: isEntry }) => ({
    path, name, directory, entry: isEntry,
  }));
}

/**
 * Quick Open also accepts file.srp:line[:column] or :line[:column]
 * for the active file. Virtual .srp paths never contain ':', so suffixes
 * can be parsed unambiguously without filesystem or compiler access.
 */
export type QuickOpenQuery = {
  filter: string;
  line: number | null;
  column: number | null;
  activeFileOnly: boolean;
};

export function parseQuickOpenQuery(raw: string): QuickOpenQuery | null {
  if (raw.length > MAX_QUICK_OPEN_QUERY) return null;
  const query = raw.trim();
  if (!query.includes(':')) {
    return { filter: query, line: null, column: null, activeFileOnly: false };
  }
  const match = /^([^:]*):([1-9]\d{0,5})(?::([1-9]\d{0,5}))?$/.exec(query);
  if (!match) return null;
  return {
    filter: match[1],
    line: Number(match[2]),
    column: match[3] ? Number(match[3]) : null,
    activeFileOnly: match[1].length === 0,
  };
}

/** Clamp line/column to the actual in-memory file, using Monaco UTF-16 columns. */
export function quickOpenPosition(
  source: string, line: number, column: number | null,
): { line: number; column: number } {
  const lines = source.split(/\r\n|\r|\n/);
  const boundedLine = Math.max(1, Math.min(line, lines.length));
  const text = lines[boundedLine - 1];
  let boundedColumn = Math.max(1, Math.min(column ?? 1, text.length + 1));
  // Do not place the cursor between UTF-16 surrogates of one scalar value.
  if (boundedColumn > 1 && boundedColumn <= text.length &&
      /[\uD800-\uDBFF]/.test(text[boundedColumn - 2]) &&
      /[\uDC00-\uDFFF]/.test(text[boundedColumn - 1])) {
    boundedColumn += 1;
  }
  return { line: boundedLine, column: boundedColumn };
}
