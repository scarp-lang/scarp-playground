import { describe, expect, it } from 'vitest';
import {
  analyzeSourceHygiene, planSourceHygieneCleanup, filterSourceHygiene,
  MAX_HYGIENE_ISSUES, MAX_HYGIENE_QUERY,
} from '../src/source-hygiene';
import type { Workspace } from '../src/workspace';

const project = (text: string, path = 'main.srp'): Workspace => ({
  entry: path, files: { [path]: text },
});
const report = (text: string) => analyzeSourceHygiene(project(text));
const fix = (text: string) => planSourceHygieneCleanup(project(text));

describe('source hygiene and Unicode safety', () => {
  it('reports no findings for a clean program', () => {
    expect(report('bind answer = 42;\n')).toEqual({
      ok: true, issues: [], truncated: false,
      counts: { security: 0, warning: 0, info: 0 }, fixable: 0,
    });
    expect(fix('bind answer = 42;\n')).toEqual({
      ok: false, error: 'No safely fixable source hygiene findings.',
    });
  });

  it('reports a bidirectional override without mutating or silently removing it', () => {
    const source = 'bind word = "safe\u202Eunsafe";\n';
    const result = report(source);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.issues).toContainEqual(expect.objectContaining({
      path: 'main.srp', line: 1, column: 18,
      rule: 'bidi-control', severity: 'security', fixable: false,
    }));
    expect(fix(source).ok).toBe(false);
  });

  it('flags all text direction markers and isolates their severity', () => {
    const marks = ['\u202A', '\u202B', '\u202C', '\u202D', '\u202E',
      '\u2066', '\u2067', '\u2068', '\u2069', '\u061C', '\u200E', '\u200F'];
    const source = marks.join('\n') + '\n';
    const result = report(source);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.counts.security).toBe(marks.length);
    expect(result.counts.warning).toBe(0);
    expect(result.issues.every(x => x.rule === 'bidi-control')).toBe(true);
  });

  it('flags invisible format characters as non-autofixable warnings', () => {
    const source = 'bind a\u200B = 1;\n// \u200C\u200D\u2060\uFEFF\n';
    const result = report(source);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const hidden = result.issues.filter(x => x.rule === 'invisible-character');
    expect(hidden).toHaveLength(5);
    expect(hidden.every(x => !x.fixable && x.severity === 'warning')).toBe(true);
  });

  it('detects nonbreaking Unicode spaces in identifiers, comments, and literals', () => {
    const result = report('bind\u00A0item = 2;\n//\u2007note\nprint("\u202F");\n');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.issues.filter(x => x.rule === 'nonbreaking-space')).toHaveLength(3);
    expect(result.counts.warning).toBe(3);
  });

  it('flags NUL, escape and DEL without altering the source', () => {
    const source = 'bind x = 1;\u0000\u001B\u007F\n';
    const result = report(source);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.issues.filter(x => x.rule === 'control-character')).toHaveLength(3);
    expect(fix(source).ok).toBe(false);
  });

  it('uses UTF-16 editor columns even after a supplementary Unicode character', () => {
    const result = report('print("😀\u202E");\n');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.issues.find(x => x.rule === 'bidi-control')?.column).toBe(10);
  });

  it('rejects malformed workspaces before examining content', () => {
    const invalid = { entry: 'bad.srp', files: { 'main.srp': 'print(1);' } };
    expect(analyzeSourceHygiene(invalid)).toMatchObject({
      ok: false, error: expect.stringContaining('entry'),
    });
    expect(planSourceHygieneCleanup(invalid)).toMatchObject({ ok: false });
  });

  it('rejects invalid unpaired surrogate source rather than normalizing it', () => {
    const invalid = project('bind x = "\uD800";');
    expect(analyzeSourceHygiene(invalid).ok).toBe(false);
    expect(planSourceHygieneCleanup(invalid).ok).toBe(false);
  });

  it('trims trailing spaces and tabs after comments and code', () => {
    const initial = 'bind n = 1; \t \n// a comment \t\nprint(n);\t \n';
    const result = fix(initial);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.workspace.files['main.srp']).toBe('bind n = 1;\n// a comment\nprint(n);\n');
    expect(result.trimmedLines).toBe(3);
    expect(result.finalNewlines).toBe(0);
    expect(result.normalizedFiles).toBe(0);
  });

  it('does not remove trailing spaces from a triple quoted string', () => {
    const initial = 'bind text = """\nhello   \n  world\t  \n""";\t\n';
    const result = fix(initial);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.workspace.files['main.srp']).toBe(
      'bind text = """\nhello   \n  world\t  \n""";\n',
    );
    expect(result.trimmedLines).toBe(1);
    const scanned = report(initial);
    expect(scanned.ok).toBe(true);
    if (scanned.ok) {
      expect(scanned.issues.filter(x => x.rule === 'trailing-whitespace')).toHaveLength(1);
    }
  });

  it('keeps spaces inside a triple-quoted string even when delimiters share a line', () => {
    const initial = 'bind text = """some   \nvalue \t""";   \n';
    const result = fix(initial);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.workspace.files['main.srp']).toBe(
      'bind text = """some   \nvalue \t""";\n',
    );
  });

  it('preserves raw literal spaces and trims code outside the closing quote', () => {
    const source = 'bind text = r"some text ";   \n';
    const result = fix(source);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.workspace.files['main.srp']).toBe('bind text = r"some text ";\n');
  });

  it('keeps trailing spaces in malformed double-quoted strings', () => {
    const result = fix('print("unterminated spaces   \n');
    expect(result.ok).toBe(false);
  });

  it('handles escaped quotes and keeps only the true outside-literal whitespace', () => {
    const source = 'print("text \\" still a string");\t\n';
    const result = fix(source);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.workspace.files['main.srp']).toBe(
      'print("text \\" still a string");\n',
    );
  });

  it('does not treat an identifier containing r as the start of a raw literal', () => {
    const source = 'bind car"suffix" = 1;   \n';
    const result = fix(source);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.workspace.files['main.srp']).toBe(
      'bind car"suffix" = 1;\n',
    );
  });

  it('preserves uniform CRLF and does not add a second trailing newline', () => {
    const initial = 'bind n = 4; \r\nprint(n); \r\n';
    const result = fix(initial);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.workspace.files['main.srp']).toBe('bind n = 4;\r\nprint(n);\r\n');
    expect(result.normalizedFiles).toBe(0);
  });

  it('preserves uniform CR line endings when trimming and adding EOF newline', () => {
    const initial = 'bind n = 4; \rprint(n);';
    const result = fix(initial);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.workspace.files['main.srp']).toBe('bind n = 4;\rprint(n);\n');
    expect(result.finalNewlines).toBe(1);
  });

  it('normalizes mixed CRLF, LF and CR only outside triple quoted strings', () => {
    const initial = 'bind a = 1;\r\nbind b = 2;\rprint(a + b);\n';
    const result = fix(initial);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.workspace.files['main.srp']).toBe(
      'bind a = 1;\nbind b = 2;\nprint(a + b);\n',
    );
    expect(result.normalizedFiles).toBe(1);
    expect(result.trimmedLines).toBe(0);
  });

  it('never normalizes mixed newlines in a multiline text literal', () => {
    const initial = 'bind text = """\r\none\n two\r\n""";\n';
    expect(fix(initial).ok).toBe(false);
    const result = report(initial);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.issues.some(x => x.rule === 'mixed-line-endings')).toBe(true);
  });

  it('adds a final newline to a safe source file with none', () => {
    const result = fix('bind n = 1;');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.workspace.files['main.srp']).toBe('bind n = 1;\n');
    expect(result.finalNewlines).toBe(1);
    expect(result.trimmedLines).toBe(0);
  });

  it('does not change EOF inside an unterminated triple-quoted literal', () => {
    const result = fix('bind text = """not yet complete');
    expect(result.ok).toBe(false);
  });

  it('finds mixed whitespace indentation without rewriting indentation', () => {
    const source = 'if true {\n \tprint(1);\n}\n';
    const result = report(source);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.issues.some(x => x.rule === 'mixed-indentation' && x.line === 2)).toBe(true);
    expect(fix(source).ok).toBe(false);
  });

  it('flags long lines without automatically splitting them', () => {
    const source = 'print("' + 'x'.repeat(150) + '");\n';
    const result = report(source);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.issues.some(x => x.rule === 'long-line' && x.column === 141)).toBe(true);
    expect(fix(source).ok).toBe(false);
  });

  it('preserves distinct files, entrypoint, and path identities', () => {
    const original: Workspace = {
      entry: 'src/main.srp',
      files: {
        'src/main.srp': 'import "lib/core.srp"; \n',
        'lib/core.srp': 'pub bind n = 1;',
      },
    };
    const result = planSourceHygieneCleanup(original);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.workspace.entry).toBe(original.entry);
    expect(result.changedFiles).toEqual(['lib/core.srp', 'src/main.srp']);
    expect(Object.keys(result.workspace.files).sort()).toEqual(Object.keys(original.files).sort());
    expect(original.files['lib/core.srp']).toBe('pub bind n = 1;');
    expect(result.workspace.files['lib/core.srp']).toBe('pub bind n = 1;\n');
  });

  it('never removes suspicious Unicode as part of unrelated whitespace cleanup', () => {
    const source = 'print("a\u202E");  \n';
    const result = fix(source);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.workspace.files['main.srp']).toBe('print("a\u202E");\n');
  });

  it('enforces display limits on pathological findings', () => {
    const input = Array.from({ length: MAX_HYGIENE_ISSUES + 10 }, () => '\u202E').join('');
    const result = report(input);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.issues).toHaveLength(MAX_HYGIENE_ISSUES);
    expect(result.truncated).toBe(true);
    expect(planSourceHygieneCleanup(project(input))).toEqual({
      ok: false, error: expect.stringContaining('display limit'),
    });
  });

  it('never allocates a cleanup beyond the per-file byte limit', () => {
    const source = 'x'.repeat(64 * 1024);
    const result = fix(source);
    expect(result.ok).toBe(false);
    // Either display cap or the capacity guard must reject a new EOF newline.
  });

  it('filters issues by severity, rule or path without modifying results', () => {
    const workspace: Workspace = {
      entry: 'main.srp',
      files: { 'main.srp': 'bind text = 1; \n', 'nested/other.srp': 'print("\u202E");\n' },
    };
    const result = analyzeSourceHygiene(workspace);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const original = JSON.stringify(result.issues);
    expect(filterSourceHygiene(result.issues, 'NESTED', 'security')).toHaveLength(1);
    expect(filterSourceHygiene(result.issues, 'trailing-whitespace', 'info')).toHaveLength(1);
    expect(filterSourceHygiene(result.issues, 'anything', 'security')).toHaveLength(0);
    expect(filterSourceHygiene(result.issues, 'x'.repeat(MAX_HYGIENE_QUERY + 1))).toHaveLength(0);
    expect(JSON.stringify(result.issues)).toBe(original);
  });

  it('reports only source-local positions and never executes Scarp code', () => {
    const source = 'print("unsafe text");   \n';
    const result = report(source);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.issues[0].line).toBe(1);
    expect(result.issues[0].column).toBe(22);
  });

  it('repeating cleanup is idempotent', () => {
    const initial = 'bind n = 1;  \r\nprint(n); \n';
    const first = fix(initial);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const second = planSourceHygieneCleanup(first.workspace);
    expect(second).toEqual({ ok: false, error: 'No safely fixable source hygiene findings.' });
  });
});
