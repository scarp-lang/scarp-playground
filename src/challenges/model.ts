import rawCatalogue from './catalogue.json';
import { validPath, validateWorkspace, type Workspace } from '../workspace';
import { validateTestCases, type TestCase } from '../runner/test-cases';

export const levels = ['beginner', 'intermediate', 'advanced'] as const;
export type ChallengeLevel = typeof levels[number];
export type Challenge = {
  id: string;
  title: string;
  track: string;
  level: ChallengeLevel;
  goal: string;
  hints: string[];
  starter: Workspace;
  solution: Workspace;
  cases: TestCase[];
};

type FixtureMap = Record<string, string>;
const record = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v);
const nonempty = (v: unknown, max: number): v is string =>
  typeof v === 'string' && v.trim().length > 0 && v.length <= max;

/** Validate authored catalogue entries against the same limits used by the editor. */
export function buildCatalogue(raw: unknown, fixtures: FixtureMap): Challenge[] {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > 100) throw new Error('Invalid challenge catalogue size.');
  const ids = new Set<string>();
  const used = new Set<string>();
  const result: Challenge[] = [];
  for (const row of raw) {
    if (!record(row) || typeof row.id !== 'string' || !/^[a-z][a-z0-9-]{0,63}$/.test(row.id) ||
        ids.has(row.id) || !nonempty(row.title, 100) || !nonempty(row.track, 80) ||
        !levels.includes(row.level as ChallengeLevel) || !nonempty(row.goal, 1000) ||
        !Array.isArray(row.hints) || row.hints.length < 1 || row.hints.length > 5 ||
        !row.hints.every(hint => nonempty(hint, 500)) || !validPath(row.entry) ||
        !Array.isArray(row.files) || !row.files.every(validPath) ||
        new Set(row.files).size !== row.files.length || !row.files.includes(row.entry) ||
        !Array.isArray(row.cases)) throw new Error('Invalid challenge metadata.');
    ids.add(row.id);
    const entry = row.entry;
    const files = row.files as string[];
    function workspace(kind: 'starter' | 'solution'): Workspace {
      const sources: Record<string, string> = {};
      for (const path of files) {
        const key = './fixtures/' + row.id + '/' + kind + '/' + path;
        if (!Object.hasOwn(fixtures, key) || !nonempty(fixtures[key], 65536)) {
          throw new Error('Missing or empty challenge fixture: ' + key);
        }
        used.add(key);
        sources[path] = fixtures[key];
      }
      const value = { entry, files: sources };
      const error = validateWorkspace(value);
      if (error) throw new Error('Invalid challenge workspace: ' + error);
      return value;
    }
    const cases = validateTestCases(row.cases.map(item => record(item) ? {
      name: item.name, stdin: item.stdin, allowPrompts: false,
      expected: { kind: 'output', stdout: item.stdout, stderr: item.stderr },
    } : null));
    if (!cases.ok) throw new Error('Invalid challenge cases: ' + cases.error);
    result.push({
      id: row.id, title: row.title, track: row.track, level: row.level as ChallengeLevel,
      goal: row.goal, hints: [...row.hints] as string[], starter: workspace('starter'),
      solution: workspace('solution'), cases: cases.cases,
    });
  }
  if (Object.keys(fixtures).some(key => !used.has(key))) throw new Error('Unregistered challenge fixture.');
  return result;
}

const fixtures = import.meta.glob<string>('./fixtures/**/*.srp', {
  eager: true, query: '?raw', import: 'default',
});
export const challenges = buildCatalogue(rawCatalogue, fixtures);
export const tracks = [...new Set(challenges.map(challenge => challenge.track))];

export function filterChallenges(
  catalogue: readonly Challenge[], query: string, track: string, level: string,
): Challenge[] {
  const needle = query.trim().toLowerCase();
  return catalogue.filter(challenge =>
    (!track || challenge.track === track) && (!level || challenge.level === level) &&
    (!needle || [challenge.title, challenge.goal, challenge.track, challenge.id]
      .some(value => value.toLowerCase().includes(needle))));
}

export function copyChallengeStarter(challenge: Challenge): Workspace {
  return { entry: challenge.starter.entry, files: { ...challenge.starter.files } };
}
