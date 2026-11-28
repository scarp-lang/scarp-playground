import { useEffect, useMemo, useState } from 'react';
import type { Workspace } from './workspace';
import {
  MAX_COMPARE_CONTEXT, compareWorkspaceFiles, textFileComparison,
  type FileComparison, type FileComparisonOptions, type FileComparisonRow,
} from './source-file-compare';
import './source-file-compare.css';

type Props = {
  workspace: Workspace;
  activeFile: string;
  onNavigate: (path: string, line: number, column: number) => void;
  onClose: () => void;
};
type Snapshot = { workspace: Workspace; report: FileComparison };
const classFor = (kind: FileComparisonRow['kind']) => 'file-compare-' + kind;

export function SourceFileComparePanel({ workspace, activeFile, onNavigate, onClose }: Props) {
  const paths = useMemo(() => Object.keys(workspace.files).sort(), [workspace]);
  const [left, setLeft] = useState(activeFile);
  const [right, setRight] = useState(paths.find(item => item !== activeFile) ?? activeFile);
  const [ignoreLineEndings, setIgnoreLineEndings] = useState(false);
  const [ignoreTrailingWhitespace, setIgnoreTrailingWhitespace] = useState(false);
  const [context, setContext] = useState(2);
  const [review, setReview] = useState<Snapshot | null>(null);
  const [message, setMessage] = useState('');
  const [sideBySide, setSideBySide] = useState(true);

  const chosenLeft = paths.includes(left) ? left : activeFile;
  const chosenRight = paths.includes(right) ? right : paths.find(item => item !== chosenLeft) ?? chosenLeft;
  const report = review?.workspace === workspace ? review.report : null;
  const valid = chosenLeft !== chosenRight && paths.includes(chosenLeft) &&
    paths.includes(chosenRight);

  useEffect(() => { setReview(null); setMessage(''); }, [
    workspace, left, right, ignoreLineEndings, ignoreTrailingWhitespace, context,
  ]);

  function compare() {
    const options: FileComparisonOptions = {
      left: chosenLeft, right: chosenRight,
      ignoreLineEndings, ignoreTrailingWhitespace, context,
    };
    const result = compareWorkspaceFiles(workspace, options);
    setReview({ workspace, report: result });
    setMessage(result.ok ? 'Comparison complete. This is a read-only source excerpt.' : result.error);
  }

  async function copy() {
    if (!report?.ok) return;
    const text = textFileComparison(report);
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setMessage('Copied a bounded source comparison excerpt. Review it before sharing.');
    } catch {
      setMessage('Clipboard access was blocked. The comparison was not exported.');
    }
  }

  return <section id="source-file-compare-panel" role="region"
    aria-label="Compare Scarp source files" data-testid="source-file-compare-panel"
    className="project-search source-file-compare">
    <div className="project-search-bar">
      <div className="source-file-compare-heading">
        <h2>Compare source files</h2>
        <p>Examine two current .srp buffers side-by-side without changing either one.</p>
      </div>
      <button type="button" aria-label="Close source file comparison" onClick={onClose}>Close</button>
    </div>
    <p className="project-replace-help">
      This is a bounded line comparison, not compiler-backed semantic analysis.
      It compares literal source text and optionally ignores whitespace/endings.
      Files remain in the browser; copying an excerpt is optional.
    </p>

    {paths.length < 2
      ? <p className="project-search-status">Add a second .srp file before comparing.</p>
      : <div className="source-file-compare-options">
        <label htmlFor="compare-left-file">Left source</label>
        <select id="compare-left-file" value={chosenLeft}
          onChange={event => setLeft(event.target.value)}>
          {paths.map(item => <option key={item} value={item}>{item}</option>)}
        </select>
        <label htmlFor="compare-right-file">Right source</label>
        <select id="compare-right-file" value={chosenRight}
          onChange={event => setRight(event.target.value)}>
          {paths.map(item => <option key={item} value={item}>{item}</option>)}
        </select>
        <div className="source-file-compare-flags">
          <label>
            <input type="checkbox" checked={ignoreLineEndings}
              onChange={event => setIgnoreLineEndings(event.target.checked)}/>
            Ignore CRLF/LF/CR differences
          </label>
          <label>
            <input type="checkbox" checked={ignoreTrailingWhitespace}
              onChange={event => setIgnoreTrailingWhitespace(event.target.checked)}/>
            Ignore trailing spaces/tabs
          </label>
          <label htmlFor="compare-context-lines">Unchanged context lines</label>
          <select id="compare-context-lines" value={context}
            onChange={event => setContext(Number(event.target.value))}>
            {Array.from({ length: MAX_COMPARE_CONTEXT + 1 }, (_, index) =>
              <option key={index} value={index}>{index}</option>)}
          </select>
        </div>
        <button type="button" className="button-primary"
          disabled={!valid} onClick={compare}>Compare selected source files</button>
      </div>}

    {report && !report.ok && <p role="alert">{report.error}</p>}
    {report?.ok && <>
      <div className="source-file-compare-summary" role="status"
        aria-label="Source file comparison summary">
        <span>{report.matching} unchanged lines</span>
        <span>{report.added} added</span>
        <span>{report.removed} removed</span>
        <span>{report.changed} modified</span>
        <span>{report.leftLines} / {report.rightLines} source lines</span>
        {report.truncated && <strong>Only the first bounded change hunks are shown.</strong>}
      </div>
      <div className="source-file-compare-actions">
        <label>
          <input type="checkbox" checked={sideBySide}
            onChange={event => setSideBySide(event.target.checked)}/>
          Side-by-side layout
        </label>
        <button type="button" onClick={() => void copy()}>
          Copy comparison excerpt
        </button>
      </div>
      {report.identical
        ? <p className="project-search-status">
          These files have no differences under the selected comparison rules.
        </p>
        : <div className={'source-file-compare-results' +
            (sideBySide ? ' compare-side-by-side' : ' compare-stacked')}
          aria-label="Source comparison hunks">
          {report.hunks.map((hunk, index) => (
            <article className="source-file-compare-hunk" key={index}>
              <header>
                <strong>Hunk {index + 1}</strong>
                <span>{chosenLeft}:{hunk.leftStart} ({hunk.leftCount} lines)</span>
                <span>{chosenRight}:{hunk.rightStart} ({hunk.rightCount} lines)</span>
              </header>
              <ol>{hunk.rows.map((row, rowIndex) => (
                <li key={rowIndex} className={classFor(row.kind)}>
                  <div className="source-file-compare-row">
                    <button type="button" disabled={row.leftLine === null}
                      aria-label={'Open left source line ' + row.leftLine}
                      onClick={() => {
                        if (row.leftLine !== null) onNavigate(chosenLeft, row.leftLine, 1);
                      }}>
                      {row.leftLine ?? '·'}
                    </button>
                    <pre aria-label={'Left file comparison line ' + (row.leftLine ?? 'none')}>
                      {row.leftText ?? ''}
                    </pre>
                  </div>
                  <div className="source-file-compare-row">
                    <button type="button" disabled={row.rightLine === null}
                      aria-label={'Open right source line ' + row.rightLine}
                      onClick={() => {
                        if (row.rightLine !== null) onNavigate(chosenRight, row.rightLine, 1);
                      }}>
                      {row.rightLine ?? '·'}
                    </button>
                    <pre aria-label={'Right file comparison line ' + (row.rightLine ?? 'none')}>
                      {row.rightText ?? ''}
                    </pre>
                  </div>
                </li>
              ))}</ol>
            </article>
          ))}
        </div>}
      <p className="project-replace-help">
        Context and preview limits do not truncate source files. The comparison
        does not save anything or execute code.
      </p>
    </>}
    {message && <p role="status" className="project-search-status">{message}</p>}
  </section>;
}
