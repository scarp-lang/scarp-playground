import { useEffect, useMemo, useState } from 'react';
import type { RunResult } from './runner/types';
import {
  OUTPUT_TABLE_PAGE_SIZE, inspectOutputTable, viewOutputTable,
  type OutputTableFormat, type OutputTableResult, type OutputTableStream,
  type OutputTableView,
} from './output-table';
import './output-table.css';

type Props = { result: RunResult; onClose: () => void };
type Snapshot = { result: RunResult; report: OutputTableResult };

export function OutputTablePanel({ result, onClose }: Props) {
  const [stream, setStream] = useState<OutputTableStream>(
    result.stdout ? 'stdout' : 'stderr',
  );
  const [format, setFormat] = useState<OutputTableFormat>('auto');
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [query, setQuery] = useState('');
  const [columnIndex, setColumnIndex] = useState<number | null>(null);
  const [sortColumnIndex, setSortColumnIndex] = useState<number | null>(null);
  const [descending, setDescending] = useState(false);
  const [page, setPage] = useState(1);

  useEffect(() => {
    setSnapshot(null);
    setQuery('');
    setColumnIndex(null);
    setSortColumnIndex(null);
    setPage(1);
  }, [result, stream, format]);

  const report = snapshot?.result === result ? snapshot.report : null;
  const table = report?.ok ? report.table : null;
  const view: OutputTableView = { query, columnIndex, sortColumnIndex, descending, page };
  const current = useMemo(() => table ? viewOutputTable(table, view) : null,
    [table, query, columnIndex, sortColumnIndex, descending, page]);

  function inspect() {
    setSnapshot({ result, report: inspectOutputTable(result.stdout, result.stderr, stream, format) });
    setQuery('');
    setColumnIndex(null);
    setSortColumnIndex(null);
    setPage(1);
  }

  function reset() {
    setFormat('auto');
    setSnapshot(null);
    setQuery('');
    setColumnIndex(null);
    setSortColumnIndex(null);
    setDescending(false);
    setPage(1);
  }

  return <section id="output-table-panel"
    className="project-search output-table-panel"
    role="region" aria-label="Structured output inspector" data-testid="output-table-panel">
    <div className="project-search-bar">
      <div className="output-table-heading">
        <h2>Inspect structured output</h2>
        <p>Explore captured JSON, JSON lines, CSV or TSV as a bounded table.</p>
      </div>
      <button type="button" aria-label="Close structured output" onClick={onClose}>Close</button>
    </div>
    <p className="project-replace-help">
      This tool reads the most recent captured compiler output without rerunning
      Scarp or interpreting expressions, HTML, or spreadsheet formulas.
      Source and output remain local in this browser tab.
    </p>

    <div className="output-table-form">
      <label htmlFor="table-stream">Output stream</label>
      <select id="table-stream" value={stream} onChange={event =>
        setStream(event.target.value as OutputTableStream)}>
        <option value="stdout" disabled={!result.stdout}>Standard output (stdout)</option>
        <option value="stderr" disabled={!result.stderr}>Standard error (stderr)</option>
      </select>
      <label htmlFor="table-format">Data format</label>
      <select id="table-format" value={format} onChange={event =>
        setFormat(event.target.value as OutputTableFormat)}>
        <option value="auto">Detect format</option>
        <option value="json">JSON records</option>
        <option value="ndjson">JSON lines</option>
        <option value="csv">CSV with header</option>
        <option value="tsv">Tab-separated with header</option>
      </select>
      <div className="output-table-form-actions">
        <button type="button" className="button-primary"
          onClick={inspect}>Inspect captured output</button>
        <button type="button" onClick={reset}>Reset table options</button>
      </div>
    </div>

    {report && !report.ok && <p role="alert" className="output-table-error">
      {report.error}
    </p>}
    {table && <>
      <div className="output-table-summary" role="status" aria-label="Output table summary">
        <span>{table.rows.length} parsed rows</span>
        <span>{table.columns.length} columns</span>
        <span>{table.format.toUpperCase()}</span>
        <span>{table.stream}</span>
        {table.truncated && <strong>Only the first 200 records are shown.</strong>}
      </div>
      {table.warning && <p className="output-table-warning" role="note">
        {table.warning}
      </p>}
      <div className="output-table-controls">
        <label htmlFor="table-filter-query">Filter table cells</label>
        <input id="table-filter-query" type="search" maxLength={100}
          autoComplete="off" placeholder="Find in rendered cells…"
          value={query} onChange={event => { setQuery(event.target.value); setPage(1); }}/>
        <label htmlFor="table-filter-column">Filter field</label>
        <select id="table-filter-column" value={columnIndex === null ? 'all' : String(columnIndex)}
          onChange={event => {
            setColumnIndex(event.target.value === 'all' ? null : Number(event.target.value));
            setPage(1);
          }}>
          <option value="all">Every column</option>
          {table.columns.map((name, index) =>
            <option key={index} value={index}>{name}</option>)}
        </select>
        <label htmlFor="table-sort-column">Sort field</label>
        <select id="table-sort-column" value={sortColumnIndex === null ? 'none' : String(sortColumnIndex)}
          onChange={event => {
            setSortColumnIndex(event.target.value === 'none' ? null : Number(event.target.value));
            setPage(1);
          }}>
          <option value="none">Original row order</option>
          {table.columns.map((name, index) =>
            <option key={index} value={index}>{name}</option>)}
        </select>
        <label>
          <input type="checkbox" checked={descending}
            onChange={event => { setDescending(event.target.checked); setPage(1); }}/>
          Descending (text sort)
        </label>
      </div>

      {current && <div className="output-table-pagination" role="status">
        <span>{current.totalRows} matching row(s) · Showing
          {' '}{current.start}–{current.end} · Page {current.page} of {current.pages}</span>
        <div>
          <button type="button" disabled={current.page <= 1}
            onClick={() => setPage(page => Math.max(1, page - 1))}>
            Previous {OUTPUT_TABLE_PAGE_SIZE}
          </button>
          <button type="button" disabled={current.page >= current.pages}
            onClick={() => setPage(page => page + 1)}>
            Next {OUTPUT_TABLE_PAGE_SIZE}
          </button>
        </div>
      </div>}
      <div className="output-table-scroll" aria-label="Structured output table">
        <table>
          <thead><tr>{table.columns.map(name =>
            <th key={name} scope="col">{name}</th>)}</tr></thead>
          <tbody>{current?.rows.map((row, index) => <tr key={
            current.start + index
          }>
            {row.map((cell, col) => <td key={table.columns[col]}>
              <code>{cell}</code>
            </td>)}
          </tr>)}</tbody>
        </table>
      </div>
      {current?.totalRows === 0 && <p className="project-search-status">
        No table records match the current filter.
      </p>}
      <p className="project-replace-help">
        Numeric sorting is textual to avoid changing precision.
        Long cells and large result sets are previewed within strict limits.
        The full compiler output remains unchanged in the Output panel.
      </p>
    </>}
  </section>;
}
