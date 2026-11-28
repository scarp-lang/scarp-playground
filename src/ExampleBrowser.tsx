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
  const matches = useMemo(() => filterExamples(examples, query), [query]);

  return (
    <div className="example-browser">
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
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.stopPropagation();
              setQuery('');
            }
          }}
        />
        {query && (
          <button type="button" className="example-filter-clear" onClick={() => setQuery('')}
            aria-label="Clear example filter">Clear</button>
        )}
      </div>
      <div className="example-filter-count" role="status" aria-live="polite">
        {matches.length} of {examples.length} examples
      </div>
      <div className="example-list" aria-label="Example programs">
        {matches.map(({ example, index }) => (
          <button key={example.title} className="example-button" type="button" onClick={() => onSelect(example, isUntouchedExampleSession(workspace, stdin))}>
            <span className="example-symbol" aria-hidden="true">{index === 0 ? '✦' : index === 1 ? '∑' : '⌘'}</span>
            <span className="example-details">
              <strong>{example.title}</strong>
              <small>{example.description}</small>
            </span>
            <span className="example-arrow" aria-hidden="true">›</span>
          </button>
        ))}
        {matches.length === 0 && (
          <div className="example-filter-empty">
            No examples match your search. Try a feature name or compiler version.
          </div>
        )}
      </div>
    </div>
  );
}
