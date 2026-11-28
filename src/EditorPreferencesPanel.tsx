import { useEffect, useRef, useState } from 'react';
import { DEFAULT_EDITOR_PREFERENCES, EDITOR_HEIGHTS, FONT_SIZES, LINE_NUMBERS, TAB_SIZES, WHITESPACE,
  type EditorPreferences } from './editor-preferences';

type Props = {
  preferences: EditorPreferences;
  onApply: (preferences: EditorPreferences) => void;
  onClose: () => void;
};

const heights = { compact: 'Compact', standard: 'Standard', tall: 'Tall' };
const whitespaceLabels = { none: 'Never', boundary: 'Boundary spaces', all: 'All whitespace' };
const lineLabels = { on: 'Absolute', off: 'Hidden', relative: 'Relative' };

export function EditorPreferencesPanel({ preferences, onApply, onClose }: Props) {
  const [draft, setDraft] = useState<EditorPreferences>({ ...preferences });
  const dialog = useRef<HTMLDialogElement>(null);
  const first = useRef<HTMLSelectElement>(null);
  useEffect(() => {
    const node = dialog.current;
    const previous = document.activeElement;
    if (!node) return;
    node.showModal();
    first.current?.focus();
    return () => {
      node.close();
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus();
    };
  }, []);

  function update<K extends keyof EditorPreferences>(key: K, value: EditorPreferences[K]) {
    setDraft(current => ({ ...current, [key]: value }));
  }

  const toggles: Array<{ key: 'insertSpaces' | 'wordWrap' | 'minimap' | 'bracketPairColorization' | 'autoClosingBrackets' | 'smoothScrolling';
    label: string; detail: string }> = [
    { key: 'insertSpaces', label: 'Insert spaces', detail: 'Indent future edits with spaces rather than tab characters.' },
    { key: 'wordWrap', label: 'Word wrap', detail: 'Wrap long lines visually; existing source stays unchanged.' },
    { key: 'minimap', label: 'Minimap', detail: 'Show a compact overview of the active source.' },
    { key: 'bracketPairColorization', label: 'Color matching brackets', detail: 'Distinguish nested bracket pairs visually.' },
    { key: 'autoClosingBrackets', label: 'Auto-close brackets', detail: 'Insert matching bracket characters while typing.' },
    { key: 'smoothScrolling', label: 'Smooth scrolling', detail: 'Animate editor scrolling.' },
  ];
  return <dialog className="editor-preferences-dialog" aria-labelledby="editor-preferences-title" ref={dialog}
    onCancel={event => { event.preventDefault(); onClose(); }}
    onKeyDown={event => event.stopPropagation()}>
    <form onSubmit={event => { event.preventDefault(); onApply(draft); }}>
      <div className="quick-open-heading"><div><h2 id="editor-preferences-title">Editor preferences</h2>
        <p>Local editor appearance and editing behavior. No source or input is saved here.</p></div>
        <button type="button" aria-label="Close editor preferences" onClick={onClose}>×</button></div>
      <fieldset className="preferences-fields">
        <legend>Appearance and indentation</legend>
        <label>Font size<select ref={first} value={draft.fontSize}
          onChange={event => update('fontSize', Number(event.target.value) as EditorPreferences['fontSize'])}>
          {FONT_SIZES.map(value => <option key={value} value={value}>{value} px</option>)}</select></label>
        <label>Tab size<select value={draft.tabSize}
          onChange={event => update('tabSize', Number(event.target.value) as EditorPreferences['tabSize'])}>
          {TAB_SIZES.map(value => <option key={value} value={value}>{value} columns</option>)}</select></label>
        <label>Line numbers<select value={draft.lineNumbers}
          onChange={event => update('lineNumbers', event.target.value as EditorPreferences['lineNumbers'])}>
          {LINE_NUMBERS.map(value => <option key={value} value={value}>{lineLabels[value]}</option>)}</select></label>
        <label>Whitespace markers<select value={draft.renderWhitespace}
          onChange={event => update('renderWhitespace', event.target.value as EditorPreferences['renderWhitespace'])}>
          {WHITESPACE.map(value => <option key={value} value={value}>{whitespaceLabels[value]}</option>)}</select></label>
        <label>Editor height<select value={draft.height}
          onChange={event => update('height', event.target.value as EditorPreferences['height'])}>
          {EDITOR_HEIGHTS.map(value => <option key={value} value={value}>{heights[value]}</option>)}</select></label>
      </fieldset>
      <fieldset className="preferences-toggles">
        <legend>Editing and navigation</legend>
        {toggles.map(item => <label key={item.key}><input type="checkbox" checked={draft[item.key]}
          onChange={event => update(item.key, event.target.checked)} />
          <span><strong>{item.label}</strong><small>{item.detail}</small></span></label>)}
      </fieldset>
      <div className="preferences-actions">
        <button type="button" className="button-secondary" onClick={() => setDraft({ ...DEFAULT_EDITOR_PREFERENCES })}>Reset defaults</button>
        <button type="button" className="button-secondary" onClick={onClose}>Cancel</button>
        <button type="submit" className="button-primary">Apply preferences</button>
      </div>
      <p className="project-search-status">Changes apply to existing editor models without reformatting their text or clearing undo history.</p>
    </form>
  </dialog>;
}
