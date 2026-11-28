/** Preferences are source-independent. Never serialize workspace or input. */
export const EDITOR_PREFERENCES_KEY = 'scarp-playground-editor-preferences-v1';
export const MAX_PREFERENCES_CHARS = 4096;
export const FONT_SIZES = [12, 13, 14, 15, 16, 18, 20, 22, 24] as const;
export const TAB_SIZES = [2, 4, 8] as const;
export const LINE_NUMBERS = ['on', 'off', 'relative'] as const;
export const WHITESPACE = ['none', 'boundary', 'all'] as const;
export const EDITOR_HEIGHTS = ['compact', 'standard', 'tall'] as const;

export type EditorPreferences = {
  fontSize: typeof FONT_SIZES[number];
  tabSize: typeof TAB_SIZES[number];
  lineNumbers: typeof LINE_NUMBERS[number];
  renderWhitespace: typeof WHITESPACE[number];
  height: typeof EDITOR_HEIGHTS[number];
  insertSpaces: boolean;
  wordWrap: boolean;
  minimap: boolean;
  bracketPairColorization: boolean;
  autoClosingBrackets: boolean;
  smoothScrolling: boolean;
};

export const DEFAULT_EDITOR_PREFERENCES: Readonly<EditorPreferences> = Object.freeze({
  fontSize: 14, tabSize: 2, lineNumbers: 'on', renderWhitespace: 'none', height: 'standard',
  insertSpaces: true, wordWrap: false, minimap: false, bracketPairColorization: true,
  autoClosingBrackets: true, smoothScrolling: false,
});

const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
function choice<T extends string | number>(value: unknown, options: readonly T[], fallback: T): T {
  return options.includes(value as T) ? value as T : fallback;
}
const boolean = (value: unknown, fallback: boolean) => typeof value === 'boolean' ? value : fallback;

/** Project only known, individually validated fields. No arbitrary Monaco options. */
export function normalizeEditorPreferences(value: unknown): EditorPreferences {
  const input = record(value) ? value : {};
  const d = DEFAULT_EDITOR_PREFERENCES;
  return {
    fontSize: choice(input.fontSize, FONT_SIZES, d.fontSize),
    tabSize: choice(input.tabSize, TAB_SIZES, d.tabSize),
    lineNumbers: choice(input.lineNumbers, LINE_NUMBERS, d.lineNumbers),
    renderWhitespace: choice(input.renderWhitespace, WHITESPACE, d.renderWhitespace),
    height: choice(input.height, EDITOR_HEIGHTS, d.height),
    insertSpaces: boolean(input.insertSpaces, d.insertSpaces),
    wordWrap: boolean(input.wordWrap, d.wordWrap),
    minimap: boolean(input.minimap, d.minimap),
    bracketPairColorization: boolean(input.bracketPairColorization, d.bracketPairColorization),
    autoClosingBrackets: boolean(input.autoClosingBrackets, d.autoClosingBrackets),
    smoothScrolling: boolean(input.smoothScrolling, d.smoothScrolling),
  };
}

export function parseEditorPreferences(raw: string | null): EditorPreferences {
  if (!raw || raw.length > MAX_PREFERENCES_CHARS) return normalizeEditorPreferences(null);
  try {
    const input: unknown = JSON.parse(raw);
    return record(input) && input.version === 1 ? normalizeEditorPreferences(input.preferences) :
      normalizeEditorPreferences(null);
  } catch { return normalizeEditorPreferences(null); }
}

export function readEditorPreferences(storage: Pick<Storage, 'getItem'>): EditorPreferences {
  try { return parseEditorPreferences(storage.getItem(EDITOR_PREFERENCES_KEY)); }
  catch { return normalizeEditorPreferences(null); }
}

export function writeEditorPreferences(storage: Pick<Storage, 'setItem'>, preferences: EditorPreferences): boolean {
  try {
    storage.setItem(EDITOR_PREFERENCES_KEY, JSON.stringify({ version: 1, preferences: normalizeEditorPreferences(preferences) }));
    return true;
  } catch { return false; }
}

/** Monaco separates model indentation from view options. Updating these
 * options does not reformat existing source or recreate model undo history. */
export function editorViewOptions(p: EditorPreferences) {
  return {
    fontSize: p.fontSize,
    lineNumbers: p.lineNumbers,
    renderWhitespace: p.renderWhitespace,
    wordWrap: p.wordWrap ? 'on' as const : 'off' as const,
    minimap: { enabled: p.minimap },
    bracketPairColorization: { enabled: p.bracketPairColorization },
    autoClosingBrackets: p.autoClosingBrackets ? 'languageDefined' as const : 'never' as const,
    smoothScrolling: p.smoothScrolling,
  };
}

export function editorModelOptions(p: EditorPreferences) {
  return { tabSize: p.tabSize, indentSize: p.tabSize, insertSpaces: p.insertSpaces };
}
