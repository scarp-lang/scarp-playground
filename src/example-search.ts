import type { Example } from './examples';

export const MAX_EXAMPLE_FILTER_LENGTH = 120;

export type ExampleMatch = {
  index: number;
  example: Example;
};

/**
 * Case-insensitive, term-wise search over the examples' published metadata.
 * Preserve the source list's indices: selecting a filtered result must never
 * load a different example from the unfiltered registry.
 *
 * Do not index source text or stdin. These fields can be large, and the
 * example picker is a navigation surface, not a source-code search.
 */
export function filterExamples(examples: readonly Example[], query: string): ExampleMatch[] {
  const terms = query.slice(0, MAX_EXAMPLE_FILTER_LENGTH).trim().toLowerCase().split(/\s+/u)
    .filter(Boolean);

  return examples.flatMap((example, index) => {
    if (terms.length === 0) return [{ index, example }];
    const metadata = [
      example.title,
      example.description,
      example.entry,
      ...Object.keys(example.files),
    ].join('\n').toLowerCase();

    return terms.every((term) => metadata.includes(term)) ? [{ index, example }] : [];
  });
}
