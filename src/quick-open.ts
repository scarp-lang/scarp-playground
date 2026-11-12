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
