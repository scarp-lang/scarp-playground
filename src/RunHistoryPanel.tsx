import { useMemo, useState } from 'react';
import type { RunHistoryEntry, RunHistoryFilter, RunOutcome } from './run-history';
import {
  filterRunHistory, summarizeRunHistory, compareRecentRun, formatRunElapsed,
  serializeRunHistory,
} from './run-history';
import type { BrowserRunMode } from './runner/browser-stats';
import './run-history.css';

type Props = {
  entries: readonly RunHistoryEntry[];
  onClose: () => void;
  onClear: () => void;
};

const outcomeLabel: Record<RunOutcome, string> = {
  success: 'Completed',
  diagnostic: 'Compiler diagnostic',
  error: 'Execution error',
  timeout: 'Timed out',
  cancelled: 'Cancelled',
};

function differenceLabel(ms: number, percent: number | null): string {
  const sign = ms > 0 ? '+' : ms < 0 ? '−' : '';
  const duration = formatRunElapsed(Math.abs(ms));
  const change = percent === null ? '' :
    ' (' + (percent > 0 ? '+' : '') + percent.toFixed(1) + '%)';
  return sign + duration + change;
}

/**
 * In-memory telemetry for completed source operations. This deliberately
 * cannot show or store source code, stdin, stdout, stderr, or error messages.
 */
export function RunHistoryPanel({ entries, onClose, onClear }: Props) {
  const [mode, setMode] = useState<RunHistoryFilter['mode']>('all');
  const [outcome, setOutcome] = useState<RunHistoryFilter['outcome']>('all');
  const visible = useMemo(() => filterRunHistory(entries, { mode, outcome }), [entries, mode, outcome]);
  const summary = useMemo(() => summarizeRunHistory(visible), [visible]);
  const comparison = useMemo(() => compareRecentRun(visible), [visible]);

  function downloadHistory() {
    const content = serializeRunHistory(entries);
    if (!content) return;
    const blob = new Blob([content], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    try {
      const link = document.createElement('a');
      link.href = url;
      link.download = 'scarp-playground-run-history.json';
      link.rel = 'noopener';
      document.body.append(link);
      link.click();
      link.remove();
    } finally {
      // Delay revocation until the synthetic download click has been handled.
      setTimeout(() => URL.revokeObjectURL(url), 0);
    }
  }

  function clearHistory() {
    if (entries.length === 0 || window.confirm(
      'Clear this session’s browser run history? Only timings and operation metadata are stored.',
    )) onClear();
  }

  return <section className="project-search run-history-panel" id="run-history-panel"
    aria-label="Browser run history" data-testid="run-history-panel">
    <div className="project-search-bar">
      <div className="run-history-heading">
        <h2>Browser run history</h2>
        <p>Session-only operation timings. No source, input, output or diagnostic messages are retained.</p>
      </div>
      <button type="button" aria-label="Close run history" onClick={onClose}>Close</button>
    </div>

    <div className="run-history-filters">
      <label htmlFor="run-history-mode">Operation</label>
      <select id="run-history-mode" value={mode}
        onChange={event => setMode(event.target.value as BrowserRunMode | 'all')}>
        <option value="all">All operations</option>
        <option value="run">Run</option>
        <option value="check">Check</option>
        <option value="verify">Verify</option>
      </select>
      <label htmlFor="run-history-outcome">Outcome</label>
      <select id="run-history-outcome" value={outcome}
        onChange={event => setOutcome(event.target.value as RunOutcome | 'all')}>
        <option value="all">All outcomes</option>
        <option value="success">Completed</option>
        <option value="diagnostic">Compiler diagnostic</option>
        <option value="error">Execution error</option>
        <option value="timeout">Timed out</option>
        <option value="cancelled">Cancelled</option>
      </select>
    </div>

    <dl className="run-history-metrics" aria-label="Filtered run history summary">
      <div><dt>Operations</dt><dd>{summary.count}</dd></div>
      <div><dt>Completed</dt><dd>{summary.succeeded}</dd></div>
      <div><dt>Unsuccessful</dt><dd>{summary.failed}</dd></div>
      <div><dt>Median</dt><dd>{formatRunElapsed(summary.p50Ms)}</dd></div>
      <div><dt>P90</dt><dd>{formatRunElapsed(summary.p90Ms)}</dd></div>
      <div><dt>Fastest</dt><dd>{formatRunElapsed(summary.minMs)}</dd></div>
      <div><dt>Slowest</dt><dd>{formatRunElapsed(summary.maxMs)}</dd></div>
      <div><dt>Mean</dt><dd>{formatRunElapsed(summary.averageMs)}</dd></div>
      <div><dt>Output bytes</dt><dd>{summary.totalOutputBytes.toLocaleString('en-US')}</dd></div>
    </dl>

    {comparison?.previous && comparison.changeMs !== null && (
      <p className="run-history-comparison" role="status">
        Latest {comparison.current.mode} versus preceding {comparison.current.mode}:
        {' '}{differenceLabel(comparison.changeMs, comparison.percentChange)} elapsed.
        {' '}{comparison.changeMs <= 0 ? 'Faster or equal.' : 'Slower.'}
      </p>
    )}

    {visible.length === 0 ? (
      <p className="project-search-status" role="status">
        {entries.length ? 'No operations match the selected filters.' :
          'No completed operations yet. Run, Check or Verify code to record timing metadata.'}
      </p>
    ) : (
      <div className="run-history-table-wrap">
        <table className="run-history-table">
          <caption>Most recent completed operations (newest first)</caption>
          <thead><tr>
            <th scope="col">#</th>
            <th scope="col">Operation</th>
            <th scope="col">Outcome</th>
            <th scope="col">Elapsed</th>
            <th scope="col">Output</th>
            <th scope="col">Diagnostic</th>
          </tr></thead>
          <tbody>{[...visible].reverse().map(item => (
            <tr key={item.sequence}>
              <th scope="row">{item.sequence}</th>
              <td>{item.mode}</td>
              <td><span className={'run-history-outcome outcome-' + item.outcome}>
                {outcomeLabel[item.outcome]}</span></td>
              <td>{formatRunElapsed(item.elapsedMs)}</td>
              <td>{item.stdoutBytes === null || item.stderrBytes === null
                ? '—' : (item.stdoutBytes + item.stderrBytes).toLocaleString('en-US') + ' B'}</td>
              <td>{item.diagnosticCode ?? '—'}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
    )}

    <div className="run-history-actions">
      <button type="button" disabled={entries.length === 0}
        onClick={downloadHistory}>Download source-free JSON report</button>
      <button type="button" disabled={entries.length === 0}
        onClick={clearHistory}>Clear run history</button>
      <p>History holds at most 60 completed operations and stays in memory only.</p>
    </div>
  </section>;
}
