import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { quickOpenFiles, parseQuickOpenQuery, MAX_QUICK_OPEN_QUERY } from './quick-open';

type Props = {
  paths: string[];
  entry: string;
  activeFile: string;
  initialQuery?: string;
  onSelect: (path: string, line: number | null, column: number | null) => void;
  onClose: () => void;
};

/**
 * Browser-local, accessible path switcher. The search never touches compiler
 * workers, modifies source, persists queries, or sends data over the network.
 */
export function QuickOpenFiles({ paths, entry, activeFile, initialQuery = '', onSelect, onClose }: Props) {
  const [query, setQuery] = useState(initialQuery);
  const [selected, setSelected] = useState(0);
  const search = useRef<HTMLInputElement>(null);
  const dialog = useRef<HTMLDivElement>(null);
  const target = useMemo(() => parseQuickOpenQuery(query), [query]);
  const results = useMemo(() => {
    if (!target) return [];
    const hits = quickOpenFiles(paths, target.activeFileOnly ? '' : target.filter, entry);
    return target.activeFileOnly ? hits.filter(file => file.path === activeFile) : hits;
  }, [paths, entry, activeFile, target]);

  useEffect(() => {
    // Restore keyboard focus to the invoker after closing the dialog.
    const previousFocus = document.activeElement;
    search.current?.focus();
    return () => {
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) {
        previousFocus.focus();
      }
    };
  }, []);

  function handleKeys(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key === 'Tab') {
      const focusables = Array.from(
        dialog.current?.querySelectorAll<HTMLElement>(
          'input:not([disabled]),button:not([disabled]):not([tabindex="-1"])',
        ) ?? [],
      );
      if (!focusables.length) return;
      if (event.shiftKey && document.activeElement === focusables[0]) {
        event.preventDefault();
        focusables[focusables.length - 1].focus();
      } else if (!event.shiftKey &&
          document.activeElement === focusables[focusables.length - 1]) {
        event.preventDefault();
        focusables[0].focus();
      }
      return;
    }
    if (event.target !== search.current) return;
    if (event.key === 'ArrowDown' && results.length) {
      event.preventDefault();
      setSelected(index => (index + 1) % results.length);
    } else if (event.key === 'ArrowUp' && results.length) {
      event.preventDefault();
      setSelected(index => (index + results.length - 1) % results.length);
    } else if (event.key === 'Enter' && results[selected]) {
      event.preventDefault();
      onSelect(results[selected].path, target?.line ?? null, target?.column ?? null);
    }
  }

  return (
    <div className="quick-open-overlay" role="presentation"
      onMouseDown={event => {
        if (event.target === event.currentTarget) onClose();
      }}>
      <div className="quick-open-dialog" role="dialog" aria-modal="true"
        aria-label="Quick open Scarp file" ref={dialog} onKeyDown={handleKeys}>
        <div className="quick-open-heading">
          <div>
            <h2>Quick open</h2>
            <p>Ctrl+P / Cmd+P · file:line:column · Ctrl+G / Cmd+G for current file</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close Quick Open">×</button>
        </div>
        <label htmlFor="quick-open-file-input">Find .srp file</label>
        <input id="quick-open-file-input" type="search" ref={search}
          role="combobox" aria-autocomplete="list" aria-expanded="true"
          aria-controls="quick-open-results"
          aria-activedescendant={results[selected]
            ? 'quick-open-result-' + selected : undefined}
          value={query} maxLength={MAX_QUICK_OPEN_QUERY}
          onChange={event => { setQuery(event.target.value); setSelected(0); }}
          placeholder="File, file:line:column, or :line" spellCheck={false}
          autoComplete="off" />
        <div className="quick-open-results" id="quick-open-results"
          role="listbox" aria-label="Matching Scarp files">
          {results.map((file, index) => (
            <button type="button" role="option" id={'quick-open-result-' + index}
              key={file.path} tabIndex={-1} aria-selected={index === selected}
              className={'quick-open-hit ' + (index === selected ? 'selected' : '')}
              onMouseEnter={() => setSelected(index)}
              onClick={() => onSelect(file.path, target?.line ?? null, target?.column ?? null)}>
              <span className="quick-open-name">{file.name}
                {file.entry && <span className="entry-pill">entry</span>}
              </span>
              <span className="quick-open-path">{file.directory || 'project root'}</span>
            </button>
          ))}
          {results.length === 0 && (
            <p className="quick-open-empty" role="status">
              {query === ':' ? 'Enter a line number for the active file.' :
                'No matching .srp files or invalid line address.'}
            </p>
          )}
        </div>
        <p className="quick-open-count">{results.length} of {paths.length} files · line and column are 1-based · local search only</p>
      </div>
    </div>
  );
}
