import { describe, expect, it } from 'vitest';
import { DEFAULT_EDITOR_PREFERENCES, EDITOR_PREFERENCES_KEY, FONT_SIZES, TAB_SIZES, LINE_NUMBERS, WHITESPACE,
  EDITOR_HEIGHTS, MAX_PREFERENCES_CHARS, editorModelOptions, editorViewOptions, normalizeEditorPreferences,
  parseEditorPreferences, readEditorPreferences, writeEditorPreferences } from '../src/editor-preferences';

describe('editor preferences boundary', () => {
  it('returns a fresh default object and never mutates default values', () => {
    const value = normalizeEditorPreferences(null);
    expect(value).toEqual(DEFAULT_EDITOR_PREFERENCES);
    value.wordWrap = true;
    expect(DEFAULT_EDITOR_PREFERENCES.wordWrap).toBe(false);
    expect(Object.isFrozen(DEFAULT_EDITOR_PREFERENCES)).toBe(true);
  });
  it('accepts every supported choice and rejects arbitrary Monaco settings', () => {
    for (const fontSize of FONT_SIZES) expect(normalizeEditorPreferences({ fontSize }).fontSize).toBe(fontSize);
    for (const tabSize of TAB_SIZES) expect(normalizeEditorPreferences({ tabSize }).tabSize).toBe(tabSize);
    for (const lineNumbers of LINE_NUMBERS) expect(normalizeEditorPreferences({ lineNumbers }).lineNumbers).toBe(lineNumbers);
    for (const renderWhitespace of WHITESPACE) expect(normalizeEditorPreferences({ renderWhitespace }).renderWhitespace).toBe(renderWhitespace);
    for (const height of EDITOR_HEIGHTS) expect(normalizeEditorPreferences({ height }).height).toBe(height);
    const result = normalizeEditorPreferences({ fontSize: 10000, tabSize: 0, lineNumbers: 'malicious',
      height: 'infinite', wordWrap: 'true', minimap: true, stdin: 'private', workspace: { files: {} } });
    expect(result).toEqual({ ...DEFAULT_EDITOR_PREFERENCES, minimap: true });
  });
  it('handles corrupt, oversized and future-version storage safely', () => {
    for (const value of [null, '', '{', 'null', '[]', '{"version":2}', ' '.repeat(MAX_PREFERENCES_CHARS+1)]) {
      expect(parseEditorPreferences(value)).toEqual(DEFAULT_EDITOR_PREFERENCES);
    }
    expect(parseEditorPreferences(JSON.stringify({ version: 1, preferences: { fontSize: 18, wordWrap: true } })))
      .toEqual({ ...DEFAULT_EDITOR_PREFERENCES, fontSize: 18, wordWrap: true });
  });
  it('writes only known fields and handles denied storage', () => {
    let stored = '';
    const storage = { setItem: (key: string, value: string) => { expect(key).toBe(EDITOR_PREFERENCES_KEY); stored = value; },
      getItem: (key: string) => { expect(key).toBe(EDITOR_PREFERENCES_KEY); return stored; } };
    const value = { ...DEFAULT_EDITOR_PREFERENCES, fontSize: 20 as const, stdin: 'do not store' };
    expect(writeEditorPreferences(storage, value)).toBe(true);
    expect(stored).not.toContain('do not store');
    expect(readEditorPreferences(storage).fontSize).toBe(20);
    expect(writeEditorPreferences({ setItem() { throw new Error('quota'); } }, value)).toBe(false);
    expect(readEditorPreferences({ getItem() { throw new Error('denied'); } })).toEqual(DEFAULT_EDITOR_PREFERENCES);
  });
  it('separates model indentation from view settings', () => {
    const value = normalizeEditorPreferences({ tabSize: 4, insertSpaces: false, fontSize: 18, wordWrap: true,
      lineNumbers: 'relative', renderWhitespace: 'all', autoClosingBrackets: false, minimap: true });
    expect(editorModelOptions(value)).toEqual({ tabSize: 4, indentSize: 4, insertSpaces: false });
    expect(editorViewOptions(value)).toMatchObject({ fontSize: 18, wordWrap: 'on', lineNumbers: 'relative',
      renderWhitespace: 'all', autoClosingBrackets: 'never', minimap: { enabled: true } });
    expect(Object.hasOwn(editorViewOptions(value), 'tabSize')).toBe(false);
  });
});
