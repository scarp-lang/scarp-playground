import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { examples } from '../src/examples';
import { validateWorkspace } from '../src/workspace';

const path = '../bridge/tests/fixtures/alpha19/callable_effect_boundaries';

describe('published Scarp alpha.19 browser fixture', () => {
  it('keeps the official source byte-exact and the independently reviewed stdout', () => {
    const example = examples.find(item => item.title === 'Named function boundaries');
    expect(example).toBeDefined();
    expect(example!.description).toContain('alpha.19');
    expect(validateWorkspace({ entry: example!.entry, files: example!.files })).toBeNull();
    const source = readFileSync(new URL(path + '.srp', import.meta.url), 'utf8');
    const stdout = readFileSync(new URL(path + '.stdout', import.meta.url), 'utf8');
    expect(example!.files).toEqual({ 'main.srp': source });
    expect(source).toContain('pure funcra twice(');
    expect(source).toContain('funcra report(');
    expect(source).toContain('print(report(6));');
    expect(stdout).toBe("12\n7\n");
  });
});
