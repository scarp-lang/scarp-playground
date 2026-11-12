import { describe, expect, it } from 'vitest';
import {
  MAX_REPLACE_QUERY, MAX_REPLACEMENT_LENGTH, MAX_REPLACE_SITES,
  previewProjectReplace,
} from '../src/project-replace';

describe('safe complete project-wide replacement', () => {
  it('finds literal punctuation and treats replacement dollars as text, not directives', () => {
    const workspace = { entry: 'main.srp', files: {
      'main.srp': 'print("a.b a-b a.b");\r\nprint("A.B");',
    } };
    const plan = previewProjectReplace(workspace, 'a.b', '$&');
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.changes).toBe(3);
    expect(plan.workspace.files['main.srp']).toBe('print("$& a-b $&");\r\nprint("$&");');
    expect(plan.lines.map(x => [x.line, x.changes])).toEqual([[1, 2], [2, 1]]);
    expect(workspace.files['main.srp']).toContain('a.b');
  });

  it('sorts files and keeps unrelated text and the entry point untouched', () => {
    const plan = previewProjectReplace({ entry: 'z.srp', files: {
      'z.srp': 'twice(1)\r\n// twice',
      'other.srp': 'nothing',
      'a.srp': 'funcra twice() {}',
    } }, 'twice', 'double');
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.changedFiles).toEqual(['a.srp', 'z.srp']);
    expect(plan.lines.map(x => x.path + ':' + x.line)).toEqual([
      'a.srp:1', 'z.srp:1', 'z.srp:2',
    ]);
    expect(plan.workspace.entry).toBe('z.srp');
    expect(plan.workspace.files['other.srp']).toBe('nothing');
  });

  it('preserves Unicode, every line separator, and complete before/after lines', () => {
    const plan = previewProjectReplace({ entry: 'main.srp', files: {
      'main.srp': '😀π target\r\n😀 target\ra target\n',
    } }, 'target', 'नमस्ते');
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.workspace.files['main.srp']).toBe('😀π नमस्ते\r\n😀 नमस्ते\ra नमस्ते\n');
    expect(plan.lines.map(x => x.line)).toEqual([1, 2, 3]);
    expect(plan.lines[0]).toMatchObject({ before: '😀π target', after: '😀π नमस्ते' });
  });

  it('supports case-sensitive and case-insensitive modes', () => {
    const workspace = { entry: 'main.srp', files: { 'main.srp': 'Hello hello HELLO' } };
    const sensitive = previewProjectReplace(workspace, 'hello', 'Hi', true);
    expect(sensitive.ok).toBe(true);
    if (sensitive.ok) {
      expect(sensitive.changes).toBe(1);
      expect(sensitive.workspace.files['main.srp']).toBe('Hello Hi HELLO');
    }
    const insensitive = previewProjectReplace(workspace, 'hello', 'Hi');
    expect(insensitive.ok).toBe(true);
    if (insensitive.ok) expect(insensitive.changes).toBe(3);
  });

  it('permits deleting text but refuses no-op replacements', () => {
    const project = { entry: 'main.srp', files: { 'main.srp': 'x aa y aa' } };
    const deletion = previewProjectReplace(project, 'aa', '');
    expect(deletion.ok).toBe(true);
    if (deletion.ok) expect(deletion.workspace.files['main.srp']).toBe('x  y ');
    expect(previewProjectReplace(project, 'aa', 'aa')).toEqual({
      ok: false, error: 'No source text would change.',
    });
  });

  it('never yields a partial replacement when the cap is crossed', () => {
    const project = (count: number) => ({
      entry: 'main.srp', files: { 'main.srp': 'aa '.repeat(count) },
    });
    const exact = previewProjectReplace(project(MAX_REPLACE_SITES), 'aa', 'b');
    expect(exact.ok).toBe(true);
    if (exact.ok) expect(exact.changes).toBe(MAX_REPLACE_SITES);
    const excess = previewProjectReplace(project(MAX_REPLACE_SITES + 1), 'aa', 'b');
    expect(excess.ok).toBe(false);
    if (!excess.ok) expect(excess.error).toMatch(/More than 120/);
  });

  it('rejects multiline, control and oversized query/replacement fields', () => {
    const workspace = { entry: 'main.srp', files: { 'main.srp': 'abc' } };
    for (const query of ['a', 'z'.repeat(MAX_REPLACE_QUERY + 1), 'ab\nc', 'ab\0c']) {
      expect(previewProjectReplace(workspace, query, 'x').ok).toBe(false);
    }
    for (const value of ['x'.repeat(MAX_REPLACEMENT_LENGTH + 1), 'a\nb', 'a\rb', 'a\0b']) {
      expect(previewProjectReplace(workspace, 'ab', value).ok).toBe(false);
    }
  });

  it('refuses outputs that exceed the UTF-8 file limit', () => {
    const project = { entry: 'main.srp', files: {
      'main.srp': 'x'.repeat(65_528) + 'abc',
    } };
    const expansion = previewProjectReplace(project, 'abc', '😀😀😀');
    expect(expansion.ok).toBe(false);
    if (!expansion.ok) expect(expansion.error).toMatch(/exceed project limits/);
  });

  it('refuses invalid paths and preserves backslashes and markup as inert text', () => {
    expect(previewProjectReplace({ entry: 'main.srp', files: {
      'main.srp': 'abc', '../bad.srp': 'abc',
    } }, 'ab', 'xy').ok).toBe(false);
    const result = previewProjectReplace({ entry: 'main.srp', files: {
      'main.srp': '<div>aa</div>',
    } }, 'aa', '\\$<b>');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.workspace.files['main.srp']).toBe('<div>\\$<b></div>');
  });
});
