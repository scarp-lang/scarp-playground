import { describe, expect, it } from 'vitest';
import { completionContext } from '../src/editor-lexical-context';
import { editorCompletionHints } from '../src/editor-completions';

const files = { 'main.srp': '', 'lib.srp': '' };

describe('alpha.3 completion lexical context', () => {
  it.each([
    ['', 'code'],
    ['print("escaped\\" quote', 'string'],
    ['print("closed"); pri', 'code'],
    ['r"backslash\\', 'raw'],
    ['r"backslash\\"; pri', 'code'],
    ['other"escaped\\" quote', 'string'],
    ['"""first\nsecond // comment', 'multiline'],
    ['"""first\n"quote"\nsecond', 'multiline'],
    ['"""first\\n\nsecond"""; pri', 'code'],
    ['// """', 'comment'],
    ['// """\npri', 'code'],
    ['"unfinished\r\npri', 'code'],
    ['r"unfinished\npri', 'code'],
    ['"escaped\\\npri', 'code'],
    ['""""', 'multiline'],
  ] as const)('classifies %j as %s', (source, expected) => {
    expect(completionContext(source)).toBe(expected);
  });

  it('suppresses code and import hints inside multiline strings', () => {
    for (const prefix of ['pri', 'import "', '// pri', '']) {
      expect(editorCompletionHints(prefix, 'main.srp', files, 'bind text = """\n')).toEqual([]);
    }
  });

  it('restores normal hints after a previous multiline string closes', () => {
    const previous = 'bind text = """\nimport "fake"\n""";\n';
    expect(editorCompletionHints('pri', 'main.srp', files, previous).map(x => x.label))
      .toContain('print');
    expect(editorCompletionHints('import "', 'main.srp', files, previous).map(x => x.label))
      .toEqual(['lib.srp']);
  });

  it('handles raw literals without interpreting backslash as an escape', () => {
    expect(editorCompletionHints('r"pri', 'main.srp', files)).toEqual([]);
    expect(editorCompletionHints('r"x\\"; pri', 'main.srp', files).map(x => x.label))
      .toContain('print');
  });

  it('offers generic and literal snippets using real newline characters', () => {
    const hints = editorCompletionHints('funcra', 'main.srp', files);
    expect(hints.find(x => x.label === 'funcra generic')?.insertText).toContain('<');
    expect(hints.find(x => x.label === 'funcra numeric')?.insertText).toContain(': Numeric');
    expect(editorCompletionHints('raw', 'main.srp', files)[0]?.insertText).toMatch(/^r"/);
    expect(editorCompletionHints('multiline', 'main.srp', files)[0]?.insertText).toContain('\n');
  });
});
