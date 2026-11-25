import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { examples } from '../src/examples';
import { validateWorkspace } from '../src/workspace';

const fixtures = [
  ["array_concat","Fixed-array concatenation","[array: 12, 18]\n[array: 12, 18, 24]\n[array: 12, 18, 24]\n"],
  ["integer_reductions","Variadic integer reductions","6 6 12 24\n"],
  ["softplus","Stable vector softplus","3\ntrue true\ntrue true\ntrue\n"],
  ["frame_snapshots","Call-frame snapshot reuse","[array: 7, 8]\n[array: 42, 43]\n"],
] as const;

describe('Scarp v0.0.7-alpha.1 browser examples', () => {
  for (const [name, title, expected] of fixtures) {
    it('ships exact source and expected output for ' + title, () => {
      const example = examples.find(item => item.title === title);
      expect(example).toBeDefined();
      expect(example!.description).toContain('v0.0.7-alpha.1');
      expect(validateWorkspace({ entry: example!.entry, files: example!.files })).toBeNull();
      const prefix = '../bridge/tests/fixtures/v007_alpha1/' + name;
      expect(example!.files).toEqual({ 'main.srp': readFileSync(new URL(prefix + '.srp', import.meta.url), 'utf8') });
      expect(readFileSync(new URL(prefix + '.stdout', import.meta.url), 'utf8')).toBe(expected);
    });
  }
});
