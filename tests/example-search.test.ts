import { describe, expect, it } from 'vitest';
import { examples } from '../src/examples';
import { filterExamples, MAX_EXAMPLE_FILTER_LENGTH } from '../src/example-search';

describe('example browser filtering', () => {
  it('returns all examples in their original order for a blank query', () => {
    const result = filterExamples(examples, ' \t ');
    expect(result).toHaveLength(examples.length);
    expect(result.map(({ index }) => index)).toEqual(examples.map((_, index) => index));
  });

  it('searches the title and description independent of case and surrounding spaces', () => {
    expect(filterExamples(examples, '  NESTED pattern ').map(({ example }) => example.title))
      .toEqual(['Nested pattern matching']);
    expect(filterExamples(examples, ' ALPHA.14 ').map(({ example }) => example.title))
      .toEqual(['Nested pattern matching', 'Ordered string-map projections']);
  });

  it('supports multiple terms across metadata fields while preserving original indices', () => {
    const [result] = filterExamples(examples, 'immutable alpha.14');
    expect(result.example.title).toBe('Ordered string-map projections');
    expect(examples[result.index]).toBe(result.example);
    expect(result.index).toBeGreaterThan(0);
  });

  it('searches module paths without including private source text or ephemeral stdin', () => {
    const matches = filterExamples(examples, 'math/price.srp');
    expect(matches.map(({ example }) => example.title)).toEqual(['Decimal across modules']);
    expect(filterExamples(examples, 'println_does_not_exist')).toEqual([]);
  });

  it('treats user text as plain text, not a regex, and caps the query', () => {
    expect(filterExamples(examples, '[')).toEqual([]);
    expect(filterExamples(examples, 'z'.repeat(MAX_EXAMPLE_FILTER_LENGTH + 100))).toEqual([]);
  });
});
