import { useMemo, useState } from 'react';
import {
  MAX_INPUT_PRESETS, MAX_INPUT_PRESET_NAME_BYTES, MAX_INPUT_PRESET_TOTAL_BYTES,
  createInputPreset, renameInputPreset, replaceInputPreset,
  deleteInputPreset, clearInputPresets, findInputPreset,
  summarizeInputPresets, inputPresetDescription,
  type InputPresetLibrary,
} from './input-presets';
import type { Workspace } from './workspace';
import './input-presets.css';

type Props = {
  workspace: Workspace;
  currentInput: string;
  currentAllowPrompts: boolean;
  library: InputPresetLibrary;
  onChange: (next: InputPresetLibrary) => void;
  onLoad: (input: string, allowPrompts: boolean) => void;
  onClose: () => void;
};

export function InputPresetsPanel({
  workspace, currentInput, currentAllowPrompts, library,
  onChange, onLoad, onClose,
}: Props) {
  const [label, setLabel] = useState('');
  const [selection, setSelection] = useState<number | null>(null);
  const [editing, setEditing] = useState(false);
  const [draftLabel, setDraftLabel] = useState('');
  const [draftInput, setDraftInput] = useState('');
  const [draftPrompts, setDraftPrompts] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const selected = useMemo(() =>
    findInputPreset(library, selection ?? library.items.at(-1)?.id ?? -1), [library, selection]);
  const summary = useMemo(() => summarizeInputPresets(library), [library]);

  function capture() {
    const result = createInputPreset(
      library, label.trim() || 'Input preset ' + library.nextId,
      currentInput, currentAllowPrompts,
    );
    if (!result.ok) { setMessage(result.error); return; }
    onChange(result.library);
    setSelection(result.preset!.id);
    setLabel('');
    setMessage('Captured current buffered program input in tab memory.');
  }

  function load() {
    if (!selected) return;
    if (!window.confirm('Replace the current buffered program input and prompt setting with ' +
      selected.name + '? This does not execute Scarp code.')) return;
    onLoad(selected.input, selected.allowPrompts);
    setMessage('Loaded ' + selected.name + ' into Run input. The program has not executed.');
  }

  function startEditing() {
    if (!selected) return;
    setDraftLabel(selected.name);
    setDraftInput(selected.input);
    setDraftPrompts(selected.allowPrompts);
    setEditing(true);
  }

  function save() {
    if (!selected) return;
    const renamed = renameInputPreset(library, selected.id, draftLabel);
    if (!renamed.ok) { setMessage(renamed.error); return; }
    const updated = replaceInputPreset(renamed.library, selected.id, draftInput, draftPrompts);
    if (!updated.ok) { setMessage(updated.error); return; }
    onChange(updated.library);
    setEditing(false);
    setDraftInput('');
    setMessage('Updated the selected input preset without modifying source files.');
  }

  function discard() {
    if (!selected || !window.confirm('Discard input preset ' + selected.name + ' from this tab?')) return;
    const result = deleteInputPreset(library, selected.id);
    if (!result.ok) { setMessage(result.error); return; }
    onChange(result.library);
    setSelection(null);
    setEditing(false);
    setDraftInput('');
    setMessage('Input preset discarded.');
  }

  function clear() {
    if (library.items.length && !window.confirm(
      'Discard all buffered input presets? This cannot be undone after leaving this tab.',
    )) return;
    onChange(clearInputPresets(library));
    setSelection(null);
    setEditing(false);
    setDraftInput('');
    setMessage('Session input presets cleared.');
  }

  return <section className="project-search input-presets-panel" id="input-presets-panel"
    aria-label="Buffered input presets" data-testid="input-presets-panel">
    <div className="project-search-bar">
      <div className="input-presets-heading">
        <h2>Buffered input presets</h2>
        <p>Keep up to 12 run-input configurations in memory for this tab.</p>
      </div>
      <button type="button" onClick={onClose} aria-label="Close input presets">Close</button>
    </div>
    <p className="project-replace-help">
      Input presets may contain private information. They are never put in source links,
      localStorage, exported files or browser history. Do not enter secrets unless
      needed for your local program.
    </p>
    <div className="input-presets-quota" role="status" aria-label="Input preset library usage">
      <span>{summary?.count ?? 0}/{MAX_INPUT_PRESETS} presets</span>
      <span>{summary?.totalBytes ?? 0}/{MAX_INPUT_PRESET_TOTAL_BYTES} UTF-8 bytes</span>
      <span>{summary?.promptEnabled ?? 0} buffered prompt configuration(s)</span>
    </div>

    <div className="input-presets-capture">
      <label htmlFor="input-preset-label">Name for current program input</label>
      <input id="input-preset-label" type="text" value={label}
        maxLength={MAX_INPUT_PRESET_NAME_BYTES}
        placeholder={'Input preset ' + library.nextId}
        onChange={event => setLabel(event.target.value)}/>
      <button type="button" className="button-primary" onClick={capture}
        disabled={library.items.length >= MAX_INPUT_PRESETS}>Capture current input</button>
    </div>
    {library.items.length === 0 ? (
      <p className="project-search-status" role="status">
        No input presets captured yet. Set program input first, then capture it with a name.
      </p>
    ) : <>
      <div className="input-presets-select">
        <label htmlFor="input-preset-choice">Choose saved input preset</label>
        <select id="input-preset-choice" value={selected?.id ?? ''}
          onChange={event => { setSelection(Number(event.target.value)); setEditing(false); }}>
          {library.items.map(item => (
            <option key={item.id} value={item.id}>{item.name}</option>
          ))}
        </select>
      </div>
      {selected && <div className="input-presets-preview">
        <h3>{selected.name}</h3>
        <p>{inputPresetDescription(selected)}</p>
        <p>Buffered input content remains hidden until you explicitly select Edit.</p>
      </div>}
      <div className="input-presets-actions">
        <button type="button" disabled={!selected} onClick={load}>
          Load into Run input
        </button>
        <button type="button" disabled={!selected} onClick={startEditing}>Edit selected</button>
        <button type="button" disabled={!selected} onClick={discard}>Discard selected</button>
        <button type="button" onClick={clear}>Discard all presets</button>
      </div>
      {editing && selected && <div className="input-presets-editor">
        <h3>Edit {selected.name}</h3>
        <label htmlFor="input-preset-edit-name">Preset name</label>
        <input id="input-preset-edit-name" value={draftLabel}
          maxLength={MAX_INPUT_PRESET_NAME_BYTES}
          onChange={event => setDraftLabel(event.target.value)}/>
        <label htmlFor="input-preset-edit-content">Buffered stdin content</label>
        <textarea id="input-preset-edit-content" rows={6} value={draftInput}
          spellCheck={false} onChange={event => setDraftInput(event.target.value)}/>
        <label className="input-presets-prompt-checkbox">
          <input type="checkbox" checked={draftPrompts}
            onChange={event => setDraftPrompts(event.target.checked)}/>
          Enable buffered prompts only when executing this preset
        </label>
        <div className="input-presets-actions">
          <button type="button" className="button-primary" onClick={save}>Save preset edits</button>
          <button type="button" onClick={() => { setEditing(false); setDraftInput(''); }}>Cancel</button>
        </div>
      </div>}
    </>}
    <small className="input-presets-note">
      Source project: {workspace.entry}. Input presets do not alter source code or run automatically.
      The compiler independently enforces the 16 KiB stdin budget.
    </small>
    {message && <p role="status" className="project-search-status">{message}</p>}
  </section>;
}
