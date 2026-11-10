import { describe, expect, it } from 'vitest';
import { examples } from '../src/examples';
import { validateWorkspace } from '../src/workspace';

describe('shipped compiler-backed learning examples', () => {
  it('uses unique titles and runnable, bounded .srp workspace layouts', () => {
    expect(new Set(examples.map((example) => example.title)).size).toBe(examples.length);
    for (const example of examples) {
      expect(example.description.length).toBeGreaterThan(0);
      expect(validateWorkspace({ entry: example.entry, files: example.files })).toBeNull();
      expect(Object.keys(example.files).length).toBeGreaterThan(0);
      expect(Object.values(example.files).every((source) => source.length > 0)).toBe(true);
      if (example.stdin !== undefined) {
        expect(new TextEncoder().encode(example.stdin).byteLength).toBeLessThanOrEqual(16 * 1024);
      }
    }
  });
});
