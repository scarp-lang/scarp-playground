import { describe, expect, it } from 'vitest';
import { editorCompletionHints, relativeImportPath } from '../src/editor-completions';

const files = {
  'main.srp': 'print("root");',
  'lib/main.srp': 'import "math.srp" as math;',
  'lib/math.srp': 'pub pure funcra twice(n: integer) -> integer { return n * 2; }',
  'science/stats.srp': 'pub pure funcra sum(n: integer) -> integer { return n; }',
  '../hidden.srp': 'print("not valid");',
};

describe('Scarp editor syntax hints', () => {
  it('uses compiler-supported completions with Monaco snippet placeholders', () => {
    const print = editorCompletionHints('pri', 'main.srp', files).find((item) => item.label === 'print');
    expect(print).toEqual({
      label: 'print', insertText: 'print(${1:value});', detail: 'Print values and a newline',
      kind: 'snippet', replaceLength: 3,
    });
    expect(editorCompletionHints('whi', 'main.srp', files).map((x) => x.label)).toContain('while');
    const assertion = editorCompletionHints('ass', 'main.srp', files).find((item) => item.label === 'assert');
    expect(assertion).toEqual({
      label: 'assert',
      insertText: 'assert(${1:true}, "${2:reason}");',
      detail: 'Check a Boolean condition with an optional literal message',
      kind: 'snippet',
      replaceLength: 3,
    });
    const bigint = editorCompletionHints('big', 'main.srp', files)
      .find((item) => item.label === 'bigint');
    expect(bigint).toEqual({
      label: 'bigint',
      insertText: 'bigint("${1:12345678901234567890}")',
      detail: 'Parse a bounded exact decimal integer (alpha.9)',
      kind: 'snippet', replaceLength: 3,
    });
    expect(editorCompletionHints('bigint_', 'main.srp', files).map((item) => item.label))
      .toEqual(expect.arrayContaining(['bigint_from_integer', 'bigint_to_integer', 'bigint_abs', 'bigint_pow', 'bigint_divmod']));
    expect(editorCompletionHints('arr', 'main.srp', files).map((item) => item.label))
      .toEqual(['array literal', 'array type', 'array_len', 'array_get_or', 'array_set', 'array_concat']);
    expect(editorCompletionHints('try_read', 'main.srp', files)[0]?.insertText)
      .toBe('try_read_line()');
    expect(editorCompletionHints('read_line_o', 'main.srp', files)[0]?.label)
      .toBe('read_line_or');
    expect(editorCompletionHints('zz', 'main.srp', files)).toEqual([]);
  });

  it('suggests published alpha.11 decimal helpers, not snippets within strings', () => {
    expect(editorCompletionHints('decimal_', 'main.srp', files).map((x) => x.label))
      .toEqual(expect.arrayContaining(['decimal_round', 'decimal_format', 'decimal_div_rounded']));
    expect(editorCompletionHints('decimal', 'main.srp', files)
      .find((x) => x.label === 'decimal')?.insertText)
      .toBe('decimal("${1:199.99}")');
    expect(editorCompletionHints('// decimal_', 'main.srp', files)).toEqual([]);
    expect(editorCompletionHints('print("decimal_', 'main.srp', files)).toEqual([]);
  });


  it('offers published alpha.20 exact-decimal syntax without inventing implicit conversions', () => {
    const literal = editorCompletionHints('decimal', 'main.srp', files)
      .find(item => item.label === 'decimal literal');
    expect(literal?.insertText).toBe('${1:0.1}d');
    expect(literal?.detail).toContain('no implicit float mixing');
    expect(editorCompletionHints('// decimal', 'main.srp', files)).toEqual([]);
    expect(editorCompletionHints('print("decimal', 'main.srp', files)).toEqual([]);
  });

  it('offers released alpha.12 typed records, lists, maps, and sum-type syntax', () => {
    const hints = editorCompletionHints('map_', 'main.srp', files);
    expect(hints.map(hint => hint.label)).toEqual(expect.arrayContaining([
      'map_keys', 'map_values', 'map_contains', 'map_set', 'map_remove', 'map_get_or',
    ]));
    expect(editorCompletionHints('list_', 'main.srp', files).map(h => h.label))
      .toEqual(expect.arrayContaining(['list_len', 'list_push', 'list_set', 'list_remove']));
    expect(editorCompletionHints('record d', 'main.srp', files).map(h => h.label))
      .not.toContain('record declaration');
    expect(editorCompletionHints('record', 'main.srp', files)
      .find(h => h.label === 'record declaration')?.insertText)
      .toContain('record ${1:Task}');
    expect(editorCompletionHints('option', 'main.srp', files).map(h => h.label))
      .toEqual(expect.arrayContaining(['option type', 'option Some', 'option None']));
    expect(editorCompletionHints('result', 'main.srp', files).map(h => h.label))
      .toEqual(expect.arrayContaining(['result type', 'result Ok', 'result Err']));
    expect(editorCompletionHints('// map_', 'main.srp', files)).toEqual([]);
    expect(editorCompletionHints('print("list_', 'main.srp', files)).toEqual([]);
  });

  it('offers published alpha.16 numeric, Unicode and bitwise hints safely', () => {
    expect(editorCompletionHints('quant', 'main.srp', files)
      .find((hint) => hint.label === 'quantile')?.insertText)
      .toBe('quantile(${1:values}, ${2:0.5})');
    expect(editorCompletionHints('median', 'main.srp', files)[0]?.insertText)
      .toBe('median(${1:values})');
    expect(editorCompletionHints('text_', 'main.srp', files).map((hint) => hint.label))
      .toEqual(expect.arrayContaining([
        'text_lower', 'text_upper', 'text_reverse', 'text_from_codepoint',
        'text_rfind', 'text_count',
      ]));
    expect(editorCompletionHints('bits_', 'main.srp', files).map((hint) => hint.label))
      .toEqual(expect.arrayContaining([
        'bits_count_ones', 'bits_leading_zeros', 'bits_trailing_zeros',
        'bits_reverse', 'bits_swap_bytes', 'bits_rotate_left', 'bits_rotate_right',
      ]));
    expect(editorCompletionHints('integer_', 'main.srp', files).map((hint) => hint.label))
      .toEqual(expect.arrayContaining(['integer_abs', 'integer_sign', 'integer_gcd', 'integer_lcm']));
    expect(editorCompletionHints('// quantile', 'main.srp', files)).toEqual([]);
    expect(editorCompletionHints('print("bits_', 'main.srp', files)).toEqual([]);
  });

  it('adds released array helpers with safe Monaco snippet placeholders', () => {
    expect(editorCompletionHints('array_len', 'main.srp', files)[0]?.insertText)
      .toBe('array_len(${1:values})');
    expect(editorCompletionHints('array_get_', 'main.srp', files)[0]?.label)
      .toBe('array_get_or');
    expect(editorCompletionHints('array_set', 'main.srp', files)[0]?.insertText)
      .toBe('array_set(${1:values}, ${2:index}, ${3:replacement})');
    expect(editorCompletionHints('// array_set', 'main.srp', files)).toEqual([]);
    expect(editorCompletionHints('print("array_len', 'main.srp', files)).toEqual([]);
  });

  it('offers v0.0.7-alpha.1 snippets with accurate signatures', () => {
    expect(editorCompletionHints('array_con', 'main.srp', files)[0]?.insertText)
      .toBe('array_concat(${1:left}, ${2:right})');
    expect(editorCompletionHints('integer_hcf', 'main.srp', files)[0]?.detail)
      .toContain('2–1024 integers');
    expect(editorCompletionHints('softplus', 'main.srp', files)[0]?.insertText)
      .toBe('softplus(${1:values})');
    expect(editorCompletionHints('// array_concat', 'main.srp', files)).toEqual([]);
    expect(editorCompletionHints('print("softplus', 'main.srp', files)).toEqual([]);
  });

  it('offers released typed prompt helpers but never proposes them inside comments or strings', () => {
    expect(editorCompletionHints('input_', 'main.srp', files).map((item) => item.label))
      .toEqual(['input_integer', 'input_boolean', 'input_float', 'input_bigint', 'input_decimal']);
    expect(editorCompletionHints('input_boolean', 'main.srp', files)[0]?.insertText)
      .toBe('input_boolean("${1:true/false? }")');
    expect(editorCompletionHints('input', 'main.srp', files)[0]?.detail)
      .toContain('opt-in');
    expect(editorCompletionHints('// input_integer', 'main.srp', files)).toEqual([]);
    expect(editorCompletionHints('print("input_boolean', 'main.srp', files)).toEqual([]);
  });

  it('resolves module import suggestions relative to current file, not the project root', () => {
    expect(relativeImportPath('lib/main.srp', 'lib/math.srp')).toBe('math.srp');
    expect(relativeImportPath('lib/main.srp', 'science/stats.srp')).toBe('../science/stats.srp');
    const suggestions = editorCompletionHints('import "', 'lib/main.srp', files);
    expect(suggestions.map((s) => s.label)).toEqual([
      '../main.srp', '../science/stats.srp', 'math.srp',
    ]);
    expect(suggestions.every((s) => s.kind === 'file')).toBe(true);
    expect(suggestions.every((s) => s.replaceLength === 0)).toBe(true);
  });

  it('replaces only the typed import path without duplicating characters', () => {
    expect(editorCompletionHints('import "ma', 'lib/main.srp', files)).toEqual([{
      label: 'math.srp', insertText: 'math.srp', detail: 'Local project module',
      kind: 'file', replaceLength: 2,
    }]);
    expect(editorCompletionHints('import "../science/', 'lib/main.srp', files)
      .map((s) => s.label)).toEqual(['../science/stats.srp']);
  });

  it('does not suggest keywords inside strings/comments or invalid imported paths', () => {
    expect(editorCompletionHints('// pri', 'main.srp', files)).toEqual([]);
    expect(editorCompletionHints('print("pri', 'main.srp', files)).toEqual([]);
    expect(editorCompletionHints('print("a // b"); // whi', 'main.srp', files)).toEqual([]);
    expect(editorCompletionHints('import "', '../outside.srp', files)).toEqual([]);
    expect(editorCompletionHints('import "x', 'main.srp', files)).toEqual([]);
    expect(editorCompletionHints('import "', 'main.srp', files)
      .map((s) => s.label)).not.toContain('main.srp');
  });
});


describe('alpha.4 BigInt completions', () => {
  const names = ["bigint_pow_big","bigint_pow_mod_big","bigint_factorial","bigint_fibonacci","bigint_binomial","bigint_permutation","bigint_next_prime","bigint_is_perfect_square","bigint_is_power_of_two","bigint_reverse","bigint_is_palindrome","bigint_min","bigint_max","bigint_mod_inverse","bigint_is_prime"];
  it('offers each verified builtin once, with the full prefix replacement', () => {
    const hints = editorCompletionHints('bigint_', 'main.srp', files);
    for (const name of names) {
      const matches = hints.filter(hint => hint.label === name);
      expect(matches).toHaveLength(1);
      expect(matches[0].insertText).toContain(name + '(');
      expect(matches[0].replaceLength).toBe(7);
    }
    expect(hints.find(h => h.label === 'bigint_pow_mod_big')?.insertText)
      .toBe('bigint_pow_mod_big(${1:value}, ${2:exponent}, ${3:modulus})');
  });
  it('suppresses hints inside ordinary, raw and multiline strings and comments', () => {
    for (const prefix of ['// bigint_', 'print("bigint_', 'print(r"bigint_', '"""bigint_']) {
      expect(editorCompletionHints(prefix, 'main.srp', files)).toEqual([]);
    }
    expect(editorCompletionHints('bigint_', 'main.srp', files, '"""first\n')).toEqual([]);
  });
});
