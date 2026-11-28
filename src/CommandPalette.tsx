import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { filterCommands, MAX_COMMAND_QUERY, selectedCommand, stepCommand, type WorkspaceCommand } from './command-palette';

type Props = {
  commands: readonly WorkspaceCommand[];
  onClose: () => void;
  onInvoke: (id: string) => void;
};

export function CommandPalette({ commands, onClose, onInvoke }: Props) {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const results = useMemo(() => filterCommands(commands, query), [commands, query]);
  const active = selectedCommand(results, selected);

  useEffect(() => {
    const element = dialog.current;
    const previous = document.activeElement;
    if (!element) return;
    element.showModal();
    input.current?.focus();
    return () => {
      element.close();
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus();
    };
  }, []);

  useEffect(() => {
    if (active) document.getElementById('command-option-' + active.id)?.scrollIntoView({ block: 'nearest' });
  }, [active?.id]); // Selection changes, not every parent render.

  function keys(event: KeyboardEvent<HTMLDialogElement>) {
    // Do not let the editor's global shortcuts run while navigating the modal.
    event.stopPropagation();
    if (event.nativeEvent.isComposing) return;
    if (event.key === 'Escape') { event.preventDefault(); onClose(); return; }
    if (event.target !== input.current) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      setSelected(stepCommand(results, active?.id ?? null, event.key === 'ArrowDown' ? 1 : -1));
    } else if (event.key === 'Enter' && active) {
      event.preventDefault();
      onInvoke(active.id);
    }
  }

  return <dialog className="command-palette" ref={dialog} aria-labelledby="command-palette-title"
    onKeyDown={keys} onCancel={event => { event.preventDefault(); onClose(); }}
    onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="command-palette-content">
      <div className="quick-open-heading">
        <div><h2 id="command-palette-title">Command palette</h2>
          <p>Search workspace actions · ↑ / ↓ to select · Enter to invoke</p></div>
        <button type="button" aria-label="Close command palette" onClick={onClose}>×</button>
      </div>
      <label htmlFor="command-palette-search">Search commands</label>
      <input id="command-palette-search" ref={input} type="search" role="combobox"
        aria-expanded="true" aria-controls="command-palette-results" aria-autocomplete="list"
        aria-activedescendant={active ? 'command-option-' + active.id : undefined}
        value={query} onChange={event => { setQuery(event.target.value); setSelected(null); }}
        placeholder="Run, import, find, theme…" maxLength={MAX_COMMAND_QUERY} autoComplete="off" />
      <div id="command-palette-results" className="command-palette-results" role="listbox" aria-label="Workspace commands">
        {results.map(command => <div key={command.id} id={'command-option-' + command.id} role="option"
          aria-selected={active?.id === command.id} aria-disabled={!!command.disabled}
          className={'command-option' + (active?.id === command.id ? ' selected' : '') + (command.disabled ? ' unavailable' : '')}
          onMouseEnter={() => { if (!command.disabled) setSelected(command.id); }}
          onMouseDown={event => event.preventDefault()}
          onClick={() => { if (!command.disabled) onInvoke(command.id); }}>
          <div><strong>{command.label}</strong><small>{command.description}</small></div>
          <span>{command.group}{command.shortcut ? ' · ' + command.shortcut : ''}{command.disabled ? ' · unavailable' : ''}</span>
        </div>)}
      </div>
      <p className="quick-open-count" role="status">{results.length} of {commands.length} commands
        {results.length === 0 ? ' · No matching actions.' : !active ? ' · All matching actions are unavailable.' : ''}</p>
    </div>
  </dialog>;
}
