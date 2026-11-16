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
  it('keeps alpha.7 Unicode escapes as source bytes, not JS escapes', () => {
    const conditional = examples.find((example) => example.title === 'Conditional values + Unicode escapes');
    expect(conditional).toBeDefined();
    const source = conditional!.files['main.srp'];
    expect(source).toContain(String.raw`\u{1F44B}`);
    expect(source).toContain('elif score >= 60');
    expect(source).toContain('if true { 7 } else { 1 / 0 }');
  });

  it('ships the published alpha.9 BigInt fixtures without JS arithmetic emulation', () => {
    const arithmetic = examples.find((example) => example.title === 'Exact big integers');
    expect(arithmetic?.files['main.srp']).toContain('bind a: bigint = bigint(');
    expect(arithmetic?.files['main.srp']).toContain('bigint_to_integer(one)');
    const modules = examples.find((example) => example.title === 'BigInt across modules');
    expect(modules?.files['main.srp']).toContain('exact.twice(bigint(');
    expect(modules?.files['modules/bigint_math.srp']).toContain('pub pure funcra twice(n: bigint) -> bigint');
  });

  it('ships alpha.10 arrays, BigInt arithmetic and explicit input examples', () => {
    const arrays = examples.find((example) => example.title === 'Fixed-size arrays');
    expect(arrays?.files['main.srp']).toContain('[array: [array: 1, 2]');
    expect(arrays?.files['main.srp']).toContain('array<string, 2>');
    const bigints = examples.find((example) => example.title === 'Advanced BigInt');
    expect(bigints?.files['main.srp']).toContain('bigint_divmod(');
    expect(bigints?.files['main.srp']).toContain('bigint_pow(');
    const input = examples.find((example) => example.title === 'EOF-aware input');
    expect(input?.files['main.srp']).toContain('try_read_line()');
    expect(input?.stdin).toContain('café 🌍');
    const fallback = examples.find((example) => example.title === 'Input with fallback');
    expect(fallback?.files['main.srp']).toContain('read_line_or("Guest")');
    expect(fallback?.stdin).toBe('Ada\n');
  });

  it('includes real exact decimal fixtures and transient stdin without host prompts', () => {
    const exact = examples.find((e) => e.title === 'Exact decimal arithmetic');
    expect(exact?.files['main.srp']).toContain('decimal_format(total, 2, "half_even")');
    expect(exact?.files['main.srp']).toContain('array<decimal, 2>');
    const imported = examples.find((e) => e.title === 'Decimal across modules');
    expect(imported?.files['math/price.srp']).toContain('-> decimal');
    const input = examples.find((e) => e.title === 'Buffered decimal input');
    expect(input?.files['main.srp']).toContain('decimal(read_line())');
    expect(input?.files['main.srp']).not.toContain('input_decimal(');
    expect(input?.stdin).toBe('1.225\n');
  });


  it('ships exactly the published alpha.12 structured data examples and multi-file task board', () => {
    for (const title of [
      'Data destructuring', 'Typed records and lists', 'Typed immutable maps',
      'Option/Result propagation', 'Map projections', 'Task board across modules',
    ]) {
      const example = examples.find(e => e.title === title);
      expect(example).toBeDefined();
      expect(example!.description).toContain('alpha.12');
      expect(validateWorkspace({ entry: example!.entry, files: example!.files })).toBeNull();
    }
    const task = examples.find(e => e.title === 'Task board across modules')!;
    expect(task.files['main.srp']).toContain('tasks.apply(');
    expect(task.files['board.srp']).toContain('pub variant Action');
    expect(task.files['board.srp']).toContain('list_push(');
    expect(task.files['board.srp']).toContain('map_set(');
    expect(task.files['board.srp']).toContain('result<record Board, string>');
    const maps = examples.find(e => e.title === 'Typed immutable maps')!;
    expect(maps.files['main.srp']).toContain('map<boolean, string>');
    expect(maps.files['main.srp']).toContain('map<integer, list<integer>>');
  });

  it('ships the released alpha.8 assertion fixture with no obsolete prerelease caveat', () => {
    const fixture = examples.find((example) => example.title === 'Boolean assertions');
    expect(fixture).toBeDefined();
    const source = fixture!.files['main.srp'];
    expect(source).toContain('assert(value >= 0, "value must be nonnegative");');
    expect(source).toContain('assert(sum == 3, "sum of 0, 1, 2 is 3");');
    expect(source).not.toContain('unreleased assertion development branch');
  });
});