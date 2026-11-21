import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { examples } from '../src/examples';
import { validateWorkspace } from '../src/workspace';

// Independent copies of the immutable published Scarp v0.0.6-alpha.16 fixtures.
const fixtures = [
  {
    "file": "order_statistics",
    "title": "Median and quantiles"
  },
  {
    "file": "core_collections",
    "title": "Unicode and integer utilities"
  }
] as const;

describe('published Scarp alpha.16 fixtures', () => {
  for (const fixture of fixtures) {
    it('preserves the exact official source and stdout: ' + fixture.title, () => {
      const example = examples.find((e) => e.title === fixture.title);
      expect(example).toBeDefined();
      expect(example?.description).toContain('alpha.16');
      expect(validateWorkspace({ entry: example!.entry, files: example!.files })).toBeNull();
      const source = readFileSync(new URL(
        '../bridge/tests/fixtures/alpha16/' + fixture.file + '.srp', import.meta.url,
      ), 'utf8');
      expect(example!.files['main.srp']).toBe(source);
      const stdout = readFileSync(new URL(
        '../bridge/tests/fixtures/alpha16/' + fixture.file + '.stdout', import.meta.url,
      ), 'utf8');
      expect(stdout.endsWith('\n')).toBe(true);
      expect(stdout.length).toBeGreaterThan(1);
    });
  }
  it('preserves the exact official imported module', () => {
    const example = examples.find((e) => e.title === 'Unicode and integer utilities')!;
    const module = readFileSync(new URL(
      '../bridge/tests/fixtures/alpha16/modules/collection_tools.srp', import.meta.url,
    ), 'utf8');
    expect(example.files['modules/collection_tools.srp']).toBe(module);
    expect(Object.keys(example.files).sort()).toEqual([
      'main.srp', 'modules/collection_tools.srp',
    ]);
  });
});
