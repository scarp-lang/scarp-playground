import { validPath } from './workspace';

// Only local project sources are searched. The column is a Monaco UTF-16 offset.
export const MAX_SEARCH_QUERY = 96;
export const MAX_SEARCH_RESULTS = 80;

export type ProjectSearchHit = {
  path: string;
  line: number;
  column: number;
  preview: string;
};

export type ProjectSearchResult = {
  matches: ProjectSearchHit[];
  truncated: boolean;
};

function literalRegex(query: string): RegExp {
  // Keep every character literal: search input cannot inject a regex.
  const escaped = query.replace(/[.*+?^$()|[\]{}\\]/g, '\\$&');
  return new RegExp(escaped, 'giu');
}

/** Deterministic, bounded text search through the open virtual workspace. */
export function searchProjectFiles(files: Record<string, string>, query: string): ProjectSearchResult {
  const matches: ProjectSearchHit[] = [];
  if (query.length < 2 || query.length > MAX_SEARCH_QUERY || /[\r\n]/.test(query)) {
    return { matches, truncated: false };
  }
  const expression = literalRegex(query);
  for (const path of Object.keys(files).filter(validPath).sort()) {
    const source = files[path];
    if (typeof source !== 'string') continue;
    const lines = source.split(/\r\n|\r|\n/);
    for (let index = 0; index < lines.length; index++) {
      const line = lines[index];
      for (const found of line.matchAll(expression)) {
        if (found.index === undefined) continue;
        if (matches.length === MAX_SEARCH_RESULTS) {
          return { matches, truncated: true };
        }
        const start = Math.max(0, found.index - 40);
        const end = Math.min(line.length, found.index + found[0].length + 70);
        matches.push({
          path,
          line: index + 1,
          column: found.index + 1,
          preview: (start ? '…' : '') + line.slice(start, end) + (end < line.length ? '…' : ''),
        });
      }
    }
  }
  return { matches, truncated: false };
}
