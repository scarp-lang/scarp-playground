import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { examples } from '../src/examples';
import { validateWorkspace } from '../src/workspace';

// A second, independent copy of the annotated compiler fixtures is used by
// native Rust bridge tests. Keep the browser snippets byte-for-byte in sync.
const fixtures = [
  {
    "title": "Ordered map snapshots",
    "file": "map_projection_snapshots"
  },
  {
    "title": "Boolean map snapshots",
    "file": "aggregate_resource_boundaries"
  },
  {
    "title": "Persistent task list snapshots",
    "file": "persistent_list_updates"
  },
  {
    "title": "Immutable compiler fixture",
    "file": "semantic_cache_snapshot"
  }
] as const;

describe('published Scarp alpha.13 browser examples', () => {
  for (const fixture of fixtures) {
    it('matches the official fixture source: ' + fixture.title, () => {
      const example = examples.find(e => e.title === fixture.title);
      expect(example).toBeDefined();
      expect(example?.description).toContain('alpha.13');
      expect(validateWorkspace({ entry: example!.entry, files: example!.files })).toBeNull();
      const source = readFileSync(new URL(
        '../bridge/tests/fixtures/alpha13/' + fixture.file + '.srp', import.meta.url,
      ), 'utf8');
      expect(example?.files['main.srp']).toBe(source);
      expect(readFileSync(new URL(
        '../bridge/tests/fixtures/alpha13/' + fixture.file + '.stdout', import.meta.url,
      ), 'utf8').endsWith('\\n')).toBe(true);
    });
  }
});
