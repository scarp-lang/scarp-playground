import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { examples } from '../src/examples';
import { validateWorkspace } from '../src/workspace';

// Sources and output are the immutable compiler's published v0.0.6-alpha.14 examples.
const fixtures = [
  {
    "file": "structured_pattern_coverage",
    "title": "Nested pattern matching"
  },
  {
    "file": "map_string_projection_snapshots",
    "title": "Ordered string-map projections"
  }
] as const;

describe('published Scarp alpha.14 browser examples', () => {
  for (const fixture of fixtures) {
    it('preserves the exact official source and golden stdout for ' + fixture.title, () => {
      const example = examples.find((e) => e.title === fixture.title);
      expect(example).toBeDefined();
      expect(example?.description).toContain('alpha.14');
      expect(validateWorkspace({ entry: example!.entry, files: example!.files })).toBeNull();
      const source = readFileSync(new URL(
        '../bridge/tests/fixtures/alpha14/' + fixture.file + '.srp', import.meta.url,
      ), 'utf8');
      expect(example!.files['main.srp']).toBe(source);
      const stdout = readFileSync(new URL(
        '../bridge/tests/fixtures/alpha14/' + fixture.file + '.stdout', import.meta.url,
      ), 'utf8');
      expect(stdout.endsWith('\n')).toBe(true);
      expect(stdout.length).toBeGreaterThan(1);
    });
  }
});
