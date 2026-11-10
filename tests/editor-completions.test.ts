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
    expect(editorCompletionHints('zz', 'main.srp', files)).toEqual([]);
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
