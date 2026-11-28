import { useEffect, useMemo, useState } from 'react';
import {
  MAX_OUTPUT_SEARCH_QUERY_BYTES, MAX_OUTPUT_SEARCH_RESULTS,
  searchProgramOutput, type OutputSearchOptions, type OutputSearchReport,
} from './output-search';
import type { RunResult } from './runner/types';
import './output-search.css';

type Props = { result: RunResult; onClose: () => void };
type Snapshot = { result: RunResult; report: OutputSearchReport };

export function OutputSearchPanel({ result, onClose }: Props) {
  const [query, setQuery] = useState('');
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [wholeWord, setWholeWord] = useState(false);
  const [includeStdout, setIncludeStdout] = useState(Boolean(result.stdout));
  const [includeStderr, setIncludeStderr] = useState(Boolean(result.stderr));
  const [submitted, setSubmitted] = useState<Snapshot | null>(null);
  const [groupStreams, setGroupStreams] = useState(true);
  const current = submitted?.result === result ? submitted.report : null;
  const report = current?.ok ? current : null;
  const hits = report?.hits ?? [];
  const streams = useMemo(() => groupStreams
    ? (['stdout', 'stderr'] as const)
      .filter(stream => hits.some(hit => hit.stream === stream))
      .map(stream => ({ stream, hits: hits.filter(hit => hit.stream === stream) }))
    : [{ stream: 'both' as const, hits }], [hits, groupStreams]);

  useEffect(() => { setSubmitted(null); }, [result]);

  const options: OutputSearchOptions = {
    query, caseSensitive, wholeWord, includeStdout, includeStderr,
  };
  const reset = () => {
    setQuery('');
    setCaseSensitive(false);
    setWholeWord(false);
    setIncludeStdout(Boolean(result.stdout));
    setIncludeStderr(Boolean(result.stderr));
    setSubmitted(null);
  };

  return <section id="output-search-panel" className="project-search output-search-panel"
    role="region" aria-label="Search captured program output" data-testid="output-search-panel">
    <div className="project-search-bar">
      <div className="output-search-heading">
        <h2>Find in captured output</h2>
        <p>Search the most recent compiler stdout and stderr without rerunning code.</p>
      </div>
      <button type="button" aria-label="Close output search" onClick={onClose}>Close</button>
    </div>
    <p className="project-replace-help">
      This view is read-only. Search results stay in this tab and are never
      inserted into the project URL or persistent browser storage.
      Compiler output can contain private data; previews should not be shared unintentionally.
    </p>

    <form className="output-search-form" onSubmit={event => {
      event.preventDefault();
      setSubmitted({ result, report: searchProgramOutput(result.stdout, result.stderr, options) });
    }}>
      <label htmlFor="output-search-query">Literal output text</label>
      <input id="output-search-query" type="search" value={query}
        maxLength={MAX_OUTPUT_SEARCH_QUERY_BYTES}
        autoComplete="off" spellCheck={false}
        placeholder="Search output lines…"
        onChange={event => { setQuery(event.target.value); setSubmitted(null); }}/>
      <div className="output-search-controls">
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
        <label>
          <input type="checkbox" checked={includeStdout}
            disabled={!result.stdout} onChange={event => {
              setIncludeStdout(event.target.checked); setSubmitted(null);
            }}/>
          Stdout
        </label>
        <label>
          <input type="checkbox" checked={includeStderr}
            disabled={!result.stderr} onChange={event => {
              setIncludeStderr(event.target.checked); setSubmitted(null);
            }}/>
          Stderr
        </label>
      </div>
      <div className="output-search-actions">
        <button type="submit" className="button-primary"
          disabled={!query || (!includeStdout && !includeStderr)}>Find output matches</button>
        <button type="button" onClick={reset}>Reset output search</button>
      </div>
    </form>
    {current && !current.ok && <p role="alert" className="output-search-error">
      {current.error}
    </p>}
    {report && <>
      <div className="output-search-summary" role="status" aria-label="Output search summary">
        <span>{hits.length} match(es)</span>
        <span>{report.processedLines} scanned line(s)</span>
        <span>{report.streamsSearched} stream(s)</span>
        {report.truncated && <strong>
          Partial scan; {report.reason === 'lines'
            ? 'the 20,000-line limit was reached' :
              'the first ' + MAX_OUTPUT_SEARCH_RESULTS + ' matches are shown'}.
        </strong>}
      </div>
      <div className="output-search-display">
        <label>
          <input type="checkbox" checked={groupStreams}
            onChange={event => setGroupStreams(event.target.checked)}/>
          Group by stdout / stderr
        </label>
        <small>Line and column numbers are one-based UTF-16 positions.</small>
      </div>
      {hits.length === 0
        ? <p className="project-search-status">No matching text in the selected output streams.</p>
        : <div className="output-search-results" aria-label="Output search matches">
          {streams.map(group => <div key={group.stream}>
            {groupStreams && <h3>{group.stream} · {group.hits.length} match(es)</h3>}
            <ol>{group.hits.map((hit, index) => (
              <li key={hit.stream + ':' + hit.line + ':' + hit.column + ':' + index}>
                <strong>{hit.stream}:{hit.line}:{hit.column}</strong>
                <span>Range ends at column {hit.endColumn}</span>
                <pre>
                  {hit.omittedBefore ? '…' : ''}{hit.before}
                  <mark>{hit.match}</mark>
                  {hit.after}{hit.omittedAfter ? '…' : ''}
                </pre>
              </li>
            ))}</ol>
          </div>)}
        </div>}
    </>}
  </section>;
}
