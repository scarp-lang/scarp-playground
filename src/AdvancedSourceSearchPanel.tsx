import { useEffect, useMemo, useState } from 'react';
import type { Workspace } from './workspace';
import {
  advancedSourceSearch, MAX_ADVANCED_QUERY_BYTES, MAX_ADVANCED_SOURCE_HITS,
  type AdvancedSourceSearchResult, type AdvancedSourceSearchOptions,
} from './advanced-source-search';
import './advanced-source-search.css';

type Props = {
  workspace: Workspace;
  onNavigate: (path: string, line: number, column: number) => void;
  onClose: () => void;
};
type SearchSnapshot = { workspace: Workspace; result: AdvancedSourceSearchResult };

export function AdvancedSourceSearchPanel({ workspace, onNavigate, onClose }: Props) {
  const [query, setQuery] = useState('');
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [wholeWord, setWholeWord] = useState(false);
  const [scope, setScope] = useState('all');
  const [groupByFile, setGroupByFile] = useState(true);
  const [showHelp, setShowHelp] = useState(false);
  const [submitted, setSubmitted] = useState<SearchSnapshot | null>(null);

  const files = useMemo(() => Object.keys(workspace.files).sort(), [workspace]);
  const effectiveScope = scope === 'all' || files.includes(scope) ? scope : 'all';
  const current = submitted?.workspace === workspace ? submitted.result : null;
  const report = current?.ok ? current : null;
  const hits = report?.hits ?? [];
  const groups = useMemo(() => {
    if (!groupByFile) return [{ path: '', hits }];
    return [...new Set(hits.map(hit => hit.path))].map(path => ({
      path, hits: hits.filter(hit => hit.path === path),
    }));
  }, [hits, groupByFile]);

  useEffect(() => { setSubmitted(null); }, [workspace]);

  const options: AdvancedSourceSearchOptions = {
    query, caseSensitive, wholeWord, path: effectiveScope,
  };
  function search() {
    setSubmitted({ workspace, result: advancedSourceSearch(workspace, options) });
  }
  function reset() {
    setQuery('');
    setCaseSensitive(false);
    setWholeWord(false);
    setScope('all');
    setSubmitted(null);
  }

  return <section id="advanced-source-search-panel" role="region"
    className="project-search advanced-source-search-panel"
    aria-label="Advanced source search" data-testid="advanced-source-search-panel">
    <div className="project-search-bar">
      <div className="advanced-source-heading">
        <h2>Advanced source search</h2>
        <p>Find literal phrases and combined conditions across local Scarp files.</p>
      </div>
      <button type="button" aria-label="Close advanced source search" onClick={onClose}>Close</button>
    </div>
    <p className="project-replace-help">
      This tool does not execute Scarp, upload source, or interpret user-supplied
      regular expressions. Search previews can contain source text; do not share them unintentionally.
    </p>

    <form className="advanced-source-form" onSubmit={event => { event.preventDefault(); search(); }}>
      <label htmlFor="advanced-source-query">Literal search expression</label>
      <input id="advanced-source-query" type="search" spellCheck={false}
        maxLength={MAX_ADVANCED_QUERY_BYTES} autoComplete="off"
        placeholder={'"pub bind" -temporary OR funcra'}
        value={query} onChange={event => { setQuery(event.target.value); setSubmitted(null); }}/>
      <div className="advanced-source-options">
        <label>
          <input type="checkbox" checked={caseSensitive}
            onChange={event => { setCaseSensitive(event.target.checked); setSubmitted(null); }}/>
          Match case
        </label>
        <label>
          <input type="checkbox" checked={wholeWord}
            onChange={event => { setWholeWord(event.target.checked); setSubmitted(null); }}/>
          Whole words
        </label>
        <label htmlFor="advanced-source-scope">Search file</label>
        <select id="advanced-source-scope" value={effectiveScope}
          onChange={event => { setScope(event.target.value); setSubmitted(null); }}>
          <option value="all">All .srp files</option>
          {files.map(path => <option key={path} value={path}>{path}</option>)}
        </select>
      </div>
      <div className="advanced-source-actions">
        <button type="submit" className="button-primary" disabled={!query.trim()}>
          Search sources
        </button>
        <button type="button" onClick={reset}>Clear search</button>
        <button type="button" aria-expanded={showHelp}
          aria-controls="advanced-source-help" onClick={() => setShowHelp(open => !open)}>
          {showHelp ? 'Hide help' : 'Show query help'}
        </button>
      </div>
    </form>
    {showHelp && <div id="advanced-source-help" className="advanced-source-help">
      <h3>Literal query syntax</h3>
      <p>Space-separated terms must appear on the same source line. Use double
        quotes for phrases. Prefix a term with a minus sign to exclude lines
        containing it. OR separates alternative clauses.</p>
      <p>Example: <code>"pub bind" -temporary OR funcra</code></p>
      <p>Queries support up to four OR clauses and twelve included/excluded terms,
        and show at most {MAX_ADVANCED_SOURCE_HITS} matches.</p>
    </div>}
    {current && !current.ok && <p role="alert" className="advanced-source-error">
      {current.error}
    </p>}
    {report && <>
      <div className="advanced-source-summary" role="status" aria-label="Advanced search summary">
        <span>{hits.length} result(s)</span>
        <span>{report.scannedFiles} file(s)</span>
        <span>{report.scannedLines} line(s)</span>
        <span>{report.alternatives} OR clause(s)</span>
        {report.truncated && <strong>First {MAX_ADVANCED_SOURCE_HITS} matches shown</strong>}
      </div>
      <div className="advanced-source-display">
        <label>
          <input type="checkbox" checked={groupByFile}
            onChange={event => setGroupByFile(event.target.checked)}/>
          Group results by file
        </label>
        <small>Positions use one-based editor lines and UTF-16 columns.</small>
      </div>
      {hits.length === 0 ? <p className="project-search-status">No matching source text found.</p> :
        <div className="advanced-source-results" aria-label="Advanced source results">
          {groups.map(group => <div key={group.path || 'all'}>
            {groupByFile && <h3>{group.path} · {group.hits.length} match(es)</h3>}
            <ol>{group.hits.map(hit => <li key={
              hit.path + ':' + hit.line + ':' + hit.column + ':' + hit.clause
            }>
              <div className="advanced-source-result-head">
                <button type="button"
                  aria-label={'Open match in ' + hit.path + ' line ' + hit.line +
                    ' column ' + hit.column}
                  onClick={() => onNavigate(hit.path, hit.line, hit.column)}>
                  {hit.path}:{hit.line}:{hit.column}
                </button>
                <span>Clause {hit.clause}; ends at column {hit.endColumn}</span>
              </div>
              <pre>{hit.preview}</pre>
              {hit.previewTruncated && <small>Preview shortened for display.</small>}
            </li>)}</ol>
          </div>)}
        </div>}
    </>}
  </section>;
}
