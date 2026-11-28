import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { examples } from '../src/examples';

const cases = [["generic_functions","Generic functions and inference"],["generic_variants","Generic Option and Result"],["string_operators","String operators and literals"]] as const;

it.each(cases)('ships the tested %s fixture as %s', (fixture, title) => {
  const example = examples.find(x => x.title === title);
  expect(example?.files['main.srp']).toBe(readFileSync(
    'bridge/tests/fixtures/v007_alpha3/' + fixture + '.srp', 'utf8',
  ));
  expect(example?.description).toContain('v0.0.7-alpha.3');
});
