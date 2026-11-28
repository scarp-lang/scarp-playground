import { useEffect, useMemo, useState } from 'react';
import type { RunResult } from './runner/types';
import {
  captureOutputBaseline, compareOutputBaseline,
  type OutputBaseline, type OutputCompareOptions,
} from './output-baseline';
import './output-baseline.css';

type Props = {
  latest: RunResult | null;
  baseline: OutputBaseline | null;
  onBaselineChange: (baseline: OutputBaseline | null) => void;
  onClose: () => void;
};
type Review = ReturnType<typeof compareOutputBaseline>;

export function OutputBaselinePanel({ latest, baseline, onBaselineChange, onClose }: Props) {
  const [label, setLabel] = useState('Pinned Run');
  const [stream, setStream] = useState<'stdout' | 'stderr'>('stdout');
  const [ignoreLineEndings, setIgnoreLineEndings] = useState(false);
  const [ignoreTrailingWhitespace, setIgnoreTrailingWhitespace] = useState(false);
  const [context, setContext] = useState(2);
  const [review, setReview] = useState<Review | null>(null);
  const [message, setMessage] = useState('');
  const [layout, setLayout] = useState<'side' | 'stack'>('side');

  const options: OutputCompareOptions = useMemo(() => ({
    stream, ignoreLineEndings, ignoreTrailingWhitespace, context,
  }), [stream, ignoreLineEndings, ignoreTrailingWhitespace, context]);

  useEffect(() => { setReview(null); setMessage(''); }, [
    latest, baseline, stream, ignoreLineEndings, ignoreTrailingWhitespace, context,
  ]);

  function pin() {
    if (!window.confirm(
      'Pin this successful Run stdout and stderr in tab memory? ' +
      'The output may contain private text. It will be lost on reload.',
    )) return;
    const result = captureOutputBaseline(latest, label);
    if (!result.ok) { setMessage(result.error); return; }
    onBaselineChange(result.baseline);
    setMessage('Pinned a private output baseline in this tab.');
  }

  function clear() {
    if (!baseline) return;
    if (!window.confirm('Discard the pinned output baseline from this browser tab?')) return;
    onBaselineChange(null);
    setReview(null);
    setMessage('Cleared the pinned baseline.');
  }

  function compare() {
    const result = compareOutputBaseline(baseline, latest, options);
    setReview(result);
    setMessage(result.ok
      ? 'Comparison completed. No program was executed and no output was shared.'
      : result.error);
  }

  const report = review?.ok ? review.report : null;
  return <section className="project-search output-baseline-panel" id="output-baseline-panel"
    role="region" aria-label="Compare captured program output"
    data-testid="output-baseline-panel">
    <div className="project-search-bar">
      <div className="output-baseline-heading">
        <h2>Compare Run output</h2>
        <p>Pin one successful Run and compare its output with a later execution.</p>
      </div>
      <button type="button" aria-label="Close output comparison" onClick={onClose}>Close</button>
    </div>
    <p className="project-replace-help">
      Baselines are temporary. They hold only stdout, stderr and a display label,
      never source files, stdin or compiler diagnostics. Do not pin sensitive
      output unless you intend to retain it for this browser session.
    </p>
    <div className="output-baseline-actions">
      <label htmlFor="baseline-label">Baseline name</label>
      <input id="baseline-label" type="text" value={label} maxLength={64}
        onChange={event => setLabel(event.target.value)}/>
      <button type="button" disabled={!latest?.ok} onClick={pin}>Pin current Run output</button>
      <button type="button" disabled={!baseline} onClick={clear}>Clear pinned baseline</button>
    </div>
    <div className="output-baseline-summary" role="status" aria-label="Run comparison status">
      <span>{baseline ? 'Pinned baseline: ' + baseline.label : 'No output baseline pinned'}</span>
      <span>{latest?.ok ? 'Latest successful Run available' : 'No successful latest Run'}</span>
    </div>
    {baseline && <div className="output-baseline-options">
      <label htmlFor="output-compare-stream">Output stream</label>
      <select id="output-compare-stream" value={stream}
        onChange={event => setStream(event.target.value as 'stdout' | 'stderr')}>
        <option value="stdout">Standard output (stdout)</option>
        <option value="stderr">Standard error (stderr)</option>
      </select>
      <label htmlFor="output-compare-context">Context lines</label>
      <select id="output-compare-context" value={context}
        onChange={event => setContext(Number(event.target.value))}>
        {Array.from({ length: 6 }, (_, index) =>
          <option value={index} key={index}>{index}</option>)}
      </select>
      <label><input type="checkbox" checked={ignoreLineEndings}
        onChange={event => setIgnoreLineEndings(event.target.checked)}/>
        Ignore newline style
      </label>
      <label><input type="checkbox" checked={ignoreTrailingWhitespace}
        onChange={event => setIgnoreTrailingWhitespace(event.target.checked)}/>
        Ignore trailing spaces/tabs
      </label>
      <button type="button" className="button-primary" disabled={!latest?.ok}
        onClick={compare}>Compare output against baseline</button>
    </div>}
    {review && !review.ok && <p role="alert">{review.error}</p>}
    {review?.ok && report && <>
      <div className="output-baseline-stats" role="status"
        aria-label="Output baseline comparison summary">
        <span>{review.baselineBytes} baseline bytes</span>
        <span>{review.latestBytes} latest bytes</span>
        <span>{report.matching} matching lines</span>
        <span>{report.changed} modified lines</span>
        <span>{report.added} added lines</span>
        <span>{report.removed} removed lines</span>
        {report.truncated && <strong>Change preview was limited for safety.</strong>}
      </div>
      <label className="output-baseline-layout">
        <input type="checkbox" checked={layout === 'side'}
          onChange={event => setLayout(event.target.checked ? 'side' : 'stack')}/>
        Side-by-side display
      </label>
      {report.identical ? <p className="project-search-status">
        The selected output streams are identical under these comparison rules.
      </p> : <div className={'output-baseline-diffs ' + layout}
        aria-label="Captured output differences">
        {report.hunks.map((hunk, index) => <article key={index}>
          <h3>Difference {index + 1}: baseline {hunk.leftStart},
            latest {hunk.rightStart}</h3>
          <ol>{hunk.rows.map((row, rowIndex) => <li key={rowIndex}
            className={'output-baseline-' + row.kind}>
            <div><span>{row.leftLine ?? '·'}</span>
              <pre aria-label="Previous captured output">{row.leftText ?? ''}</pre></div>
            <div><span>{row.rightLine ?? '·'}</span>
              <pre aria-label="Latest captured output">{row.rightText ?? ''}</pre></div>
          </li>)}</ol>
        </article>)}
      </div>}
    </>}
    {message && <p role="status" className="project-search-status">{message}</p>}
  </section>;
}
