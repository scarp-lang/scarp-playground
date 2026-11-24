import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { examples } from '../src/examples';
import { validateWorkspace } from '../src/workspace';

const directory = '../bridge/tests/fixtures/alpha20/';

function fixture(name: string, title: string, description: string, expected: string) {
  const example = examples.find(item => item.title === title);
  expect(example).toBeDefined();
  expect(example!.description).toContain('alpha.20');
  expect(validateWorkspace({ entry: example!.entry, files: example!.files })).toBeNull();
  const source = readFileSync(new URL(directory + name + '.srp', import.meta.url), 'utf8');
  const stdout = readFileSync(new URL(directory + name + '.stdout', import.meta.url), 'utf8');
  expect(example!.files).toEqual({ 'main.srp': source });
  expect(source).toContain(description);
  expect(stdout).toBe(expected);
}

describe('Scarp published alpha.20 browser compatibility fixtures', () => {
  it('copies both official tuple fixtures byte-exact from the published tag', () => {
    fixture('tuple_index_updates', 'Tuple element updates', 'position[0] = 50;', '(50, 100)\n(10, 20)\n');
    fixture('tuple_ordering', 'Tuple ordering', 'print(origin < target)', 'true\nfalse\ntrue\ntrue\n');
  });

  it('exercises alpha.20 literal decimals without reinterpreting binary64 floats', () => {
    fixture('decimal_literals', 'Exact decimal literals', '0.1d + 0.2d',
      '0.3 true\n0.30000000000000004\n');
  });
});
