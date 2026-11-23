import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { examples } from '../src/examples';
import { validateWorkspace } from '../src/workspace';

// Byte-exact published fixtures; this file's expected output is independent
// of the displayed source and the fixture's .stdout files.
const fixtures = [
  {
    "version": "alpha17",
    "name": "array_traversal",
    "title": "Fixed-array traversal",
    "release": "alpha.17",
    "stdout": "Total: 60\nMissing reading: 0\nEmpty length: 0\n"
  },
  {
    "version": "alpha18",
    "name": "array_updates",
    "title": "Immutable array updates",
    "release": "alpha.18",
    "stdout": "8 99 3\none नमस्ते\n100\n"
  },
  {
    "version": "alpha18",
    "name": "lifetime_windows",
    "title": "Lifetime windows",
    "release": "alpha.18",
    "stdout": "0 [2.0, 3.0]\n0 [integer: 8, 9]\n"
  }
] as const;

describe('published alpha.17/alpha.18 compiler fixture integrity', () => {
  for (const fixture of fixtures) {
    it('preserves official source and stdout: ' + fixture.title, () => {
      const example = examples.find((value) => value.title === fixture.title);
      expect(example).toBeDefined();
      expect(example?.description).toContain(fixture.release);
      expect(validateWorkspace({ entry: example!.entry, files: example!.files })).toBeNull();
      const prefix = '../bridge/tests/fixtures/' + fixture.version + '/' + fixture.name;
      const source = readFileSync(new URL(prefix + '.srp', import.meta.url), 'utf8');
      const stdout = readFileSync(new URL(prefix + '.stdout', import.meta.url), 'utf8');
      expect(source.endsWith('\n')).toBe(true);
      expect(example!.files).toEqual({ 'main.srp': source });
      expect(stdout).toBe(fixture.stdout);
    });
  }
});
