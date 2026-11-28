import { useMemo, useState } from 'react';
import { examples, type Example } from './examples';
import { isUntouchedExampleSession } from './example-session';
import type { Workspace } from './workspace';
import { filterExamples, MAX_EXAMPLE_FILTER_LENGTH } from './example-search';

type Props = {
  workspace: Workspace;
  stdin: string;
  onSelect: (example: Example, untouched: boolean) => void;
};

export function ExampleBrowser({ workspace, stdin, onSelect }: Props) {
  const [query, setQuery] = useState('');
  const [selectedTitle, setSelectedTitle] = useState('');
  const matches = useMemo(() => filterExamples(examples, query), [query]);
  const selected = matches.find(({ example }) => example.title === selectedTitle)?.example;

  function changeQuery(value: string) {
    setQuery(value);
    // A new search must not silently select or load a different program.
    setSelectedTitle('');
  }

  return (
    <section className="example-browser" aria-label="Example programs">
      <div className="section-label">EXAMPLE PROGRAMS</div>
      <label className="example-filter-label" htmlFor="example-filter">Find an example</label>
      <div className="example-filter-row">
        <input
          id="example-filter"
          className="example-filter-input"
          type="search"
          autoComplete="off"
          maxLength={MAX_EXAMPLE_FILTER_LENGTH}
          placeholder="Topic, version or module…"
          value={query}
          onChange={(event) => changeQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.stopPropagation();
              changeQuery('');
            }
          }}
        />
        {query && (
          <button type="button" className="example-filter-clear" onClick={() => changeQuery('')}
            aria-label="Clear example filter">Clear</button>
        )}
      </div>
      <div className="example-filter-count" role="status" aria-live="polite">
        {matches.length} of {examples.length} examples
      </div>
      <label className="example-filter-label" htmlFor="example-select">Choose an example</label>
      <select id="example-select" className="example-select"
        aria-describedby="example-picker-help"
        value={selected?.title ?? ''} disabled={matches.length === 0}
        onChange={event => setSelectedTitle(event.target.value)}>
        <option value="">Select an example…</option>
        {matches.map(({ example }) => (
          <option key={example.title} value={example.title}>{example.title}</option>
        ))}
      </select>
      {matches.length === 0 ? (
        <p className="example-filter-empty">No examples match your search. Try a feature name or compiler version.</p>
      ) : selected && (
        <div className="example-preview" aria-live="polite">
          <p>{selected.description}</p>
          <p className="example-preview-meta">{Object.keys(selected.files).length} source {Object.keys(selected.files).length === 1 ? 'file' : 'files'}
            {selected.stdin !== undefined ? ' · Includes sample input' : ''}</p>
        </div>
      )}
      <button type="button" className="button-secondary example-load" disabled={!selected}
        onClick={() => { if (selected) onSelect(selected, isUntouchedExampleSession(workspace, stdin)); }}>
        Load example
      </button>
      <p id="example-picker-help" className="example-picker-help">Choose a program, then load it into the editor. Browsing does not change your code.</p>
    </section>
  );
}
