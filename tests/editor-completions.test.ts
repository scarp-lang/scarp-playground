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
      .toEqual(['array literal', 'array type']);
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
