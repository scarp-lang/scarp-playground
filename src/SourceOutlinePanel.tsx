import { useState } from 'react';
import { OUTLINE_KINDS, type LocatedOutline, type LocatedOutlineEntry, type OutlineKind } from './navigation/outline-protocol';

type Props = {
  path: string;
  result: LocatedOutline | null;
  busy: boolean;
  running: boolean;
  onRefresh: () => void;
  onSelect: (entry: LocatedOutlineEntry) => void;
  onClose: () => void;
};

const labels: Record<OutlineKind, string> = {
  import: 'Import alias', function: 'Function', pure_function: 'Pure function',
  type_parameter: 'Type parameter', parameter: 'Parameter', record: 'Record',
  field: 'Field', variant: 'Variant', variant_case: 'Variant case', bind: 'Binding',
  var: 'Variable', repeat_index: 'Repeat index', match_binding: 'Match binding',
};

export function SourceOutlinePanel({ path, result, busy, running, onRefresh, onSelect, onClose }: Props) {
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState<OutlineKind | ''>('');
  const [publicOnly, setPublicOnly] = useState(false);
  const needle = query.trim().toLowerCase();
  const filtered = result?.ok ? result.entries.filter(entry =>
    (!kind || entry.kind === kind) && (!publicOnly || entry.public) &&
    (!needle || entry.name.toLowerCase().includes(needle))) : [];
  return (
    <section id="source-outline-panel" className="project-search source-outline-panel" aria-label="Source outline">
      <div className="project-search-bar source-outline-heading">
        <h2>Source outline</h2>
        <button type="button" className="button-primary" disabled={busy || running} onClick={onRefresh}>
          {busy ? 'Parsing source…' : 'Refresh outline'}
        </button>
        <button type="button" onClick={onClose}>Close outline</button>
      </div>
      <p className="project-replace-help">
        Parse the selected file with the real Scarp compiler. This shows source declarations, not resolved types or execution results.
        Imports are not loaded and no program statements run.
      </p>
      <p className="project-search-status">Active source: {path}</p>
      {!busy && !result && <p role="status" className="project-search-status">Refresh the outline for the current source.</p>}
      {busy && <p role="status" className="project-search-status">Reading the compiler syntax tree…</p>}
      {!busy && result && !result.ok && <p role="status" className="source-outline-error">{result.error}</p>}
      {!busy && result?.ok && <>
        <div className="project-search-bar source-outline-filters">
          <label>Filter symbol names
            <input type="search" value={query} maxLength={128} onChange={event => setQuery(event.target.value)} />
          </label>
          <label>Declaration kind
            <select value={kind} onChange={event => setKind(event.target.value as OutlineKind | '')}>
              <option value="">All declarations</option>
              {OUTLINE_KINDS.map(value => <option key={value} value={value}>{labels[value]}</option>)}
            </select>
          </label>
          <label className="source-outline-public">
            <input type="checkbox" checked={publicOnly} onChange={event => setPublicOnly(event.target.checked)} />
            Public declarations only
          </label>
        </div>
        <p role="status" className="project-search-status">{filtered.length} of {result.entries.length} declarations
          {result.truncated ? ' · Outline truncated by browser limits' : ''}</p>
        {filtered.length ? <ul className="source-outline-list">
          {filtered.map(entry => <li key={entry.start}>
            <button type="button" onClick={() => onSelect(entry)}
              aria-label={'Go to ' + entry.name + ' on line ' + entry.line}
              style={{ paddingLeft: 6 + Math.min(entry.depth, 8) * 10 }}>
              <strong>{entry.name}</strong>
              <span>{entry.public ? 'pub · ' : ''}{labels[entry.kind]} · {entry.line}:{entry.column}</span>
            </button>
          </li>)}
        </ul> : <p className="project-search-status">No matching declarations.</p>}
      </>}
    </section>
  );
}
