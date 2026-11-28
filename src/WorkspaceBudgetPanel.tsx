import { useMemo, useState } from 'react';
import type { Workspace } from './workspace';
import {
  filterWorkspaceBudgets, inspectWorkspaceBudget,
  type BudgetCondition, type BudgetFilter, type BudgetSort,
} from './workspace-budget';
import './workspace-budget.css';

type Props = {
  workspace: Workspace;
  onNavigate: (path: string, line: number, column: number) => void;
  onClose: () => void;
};

const defaultFilter: BudgetFilter = {
  query: '', sortBy: 'bytes', descending: true,
  conditions: 'all', onlyReachable: false,
};

function label(condition: BudgetCondition): string {
  switch (condition) {
    case 'normal': return 'Within quota';
    case 'approaching': return 'Approaching quota';
    case 'at-limit': return 'At quota';
  }
}

export function WorkspaceBudgetPanel({ workspace, onNavigate, onClose }: Props) {
  const [filter, setFilter] = useState<BudgetFilter>(defaultFilter);
  const [showLongLines, setShowLongLines] = useState(true);
  const [notice, setNotice] = useState('');
  const report = useMemo(() => inspectWorkspaceBudget(workspace), [workspace]);
  const filtered = useMemo(() => filterWorkspaceBudgets(report, filter), [report, filter]);
  const update = <K extends keyof BudgetFilter>(key: K, value: BudgetFilter[K]) =>
    setFilter(previous => ({ ...previous, [key]: value }));

  async function copySummary() {
    if (!report.ok) return;
    const text = [
      'Scarp Playground source workspace budget (metadata only)',
      'Entrypoint: ' + report.entry,
      'Source bytes: ' + report.totalBytes + ' / ' + report.quotaTotalBytes,
      'Source files: ' + report.fileCount + ' / ' + report.quotaFiles,
      'Total lines: ' + report.totalLines,
      'Local import edges: ' + report.totalImports,
      'Unresolved local imports: ' + (report.invalidImports + report.missingImports),
      ...report.files.map(file => file.path + ': ' + file.bytes +
        ' bytes, ' + file.lines + ' lines, ' + file.outgoingImports + ' imports'),
    ].join('\n');
    try {
      await navigator.clipboard.writeText(text);
      setNotice('Copied source metadata. No source, stdin or execution output was included.');
    } catch {
      setNotice('Clipboard access is unavailable. Nothing was copied.');
    }
  }

  return <section id="workspace-budget-panel" role="region"
    aria-label="Workspace resource budget"
    className="project-search workspace-budget-panel"
    data-testid="workspace-budget-panel">
    <div className="project-search-bar">
      <div className="workspace-budget-heading">
        <h2>Workspace source budget</h2>
        <p>Exact byte, line and import counts for local Scarp files.</p>
      </div>
      <button type="button" aria-label="Close workspace budget" onClick={onClose}>Close</button>
    </div>
    <p className="project-replace-help">
      These metrics describe source files only, not actual runtime memory, CPU,
      compilation duration or semantic type correctness. Reachability is
      informational and becomes unknown when import inspection is incomplete.
    </p>
    {report.ok ? <>
      <div className="workspace-budget-summary" role="status" aria-label="Source quota summary">
        <span><strong>{report.totalBytes.toLocaleString()}</strong> /
          {' '}{report.quotaTotalBytes.toLocaleString()} UTF-8 bytes</span>
        <span><strong>{report.fileCount}</strong> / {report.quotaFiles} source files</span>
        <span><strong>{report.totalLines.toLocaleString()}</strong> logical lines</span>
        <span><strong>{report.byteHeadroom.toLocaleString()}</strong> bytes available</span>
        <span><strong>{report.availableFileSlots}</strong> file slots available</span>
      </div>
      <div className="workspace-budget-track" role="img"
        aria-label={'Total source budget used ' +
          Math.round(report.totalBytes * 100 / report.quotaTotalBytes) + ' percent'}>
        <span style={{ width: (report.totalBytes * 100 / report.quotaTotalBytes) + '%' }} />
      </div>
      {(report.totalCondition !== 'normal' || report.fileCountCondition !== 'normal') &&
        <p className="workspace-budget-notice" role="status">
          Source quota: {label(report.totalCondition)}. File slots:
          {' '}{label(report.fileCountCondition)}. Large projects may need to
          split their sources into separate Playground sessions.
        </p>}
      <div className="workspace-budget-subtotals">
        <span>{report.totalImports} local import statements</span>
        <span>{report.missingImports} missing paths</span>
        <span>{report.invalidImports} unsupported import spellings</span>
        <span>{report.totalNonAsciiScalars.toLocaleString()} non-ASCII scalars</span>
      </div>
      {!report.graphComplete && <p className="workspace-budget-notice" role="status">
        Import reachability is unknown because not all imports could be
        inspected. No files are classified as unused by this panel.
        {report.graphIssues.slice(0, 2).map((issue, index) =>
          <span key={index}> {issue}</span>)}
      </p>}
      <div className="workspace-budget-controls">
        <label htmlFor="budget-query">Find file</label>
        <input id="budget-query" type="search" maxLength={96} value={filter.query}
          onChange={event => update('query', event.target.value)} />
        <label htmlFor="budget-sort">Sort by</label>
        <select id="budget-sort" value={filter.sortBy}
          onChange={event => update('sortBy', event.target.value as BudgetSort)}>
          <option value="bytes">Source bytes</option>
          <option value="lines">Logical lines</option>
          <option value="longest-line">Longest line</option>
          <option value="imports">Import count</option>
          <option value="path">File path</option>
        </select>
        <label>
          <input type="checkbox" checked={filter.descending}
            onChange={event => update('descending', event.target.checked)}/>
          Descending
        </label>
        <label htmlFor="budget-condition">File quota status</label>
        <select id="budget-condition" value={filter.conditions}
          onChange={event => update('conditions',
            event.target.value as BudgetCondition | 'all')}>
          <option value="all">All files</option>
          <option value="normal">Within quota</option>
          <option value="approaching">Approaching quota</option>
          <option value="at-limit">At quota</option>
        </select>
        <label>
          <input type="checkbox" checked={filter.onlyReachable}
            disabled={!report.graphComplete}
            onChange={event => update('onlyReachable', event.target.checked)}/>
          Only reachable from entrypoint
        </label>
      </div>
      <div className="workspace-budget-table" aria-label="Per-file source resource metrics">
        <table>
          <thead><tr><th scope="col">Scarp file</th><th scope="col">Bytes / cap</th>
            <th scope="col">Lines</th><th scope="col">Longest line</th>
            <th scope="col">Imports out / in</th><th scope="col">Reachability</th></tr></thead>
          <tbody>{filtered.map(file => <tr key={file.path}>
            <td><button type="button" aria-label={'Open budget file ' + file.path}
              onClick={() => onNavigate(file.path, 1, 1)}>{file.path}</button>
              {file.isEntry && <small>Entrypoint</small>}
            </td>
            <td>{file.bytes.toLocaleString()} / {file.quotaBytes.toLocaleString()}
              <small>{label(file.condition)}</small></td>
            <td>{file.lines}</td>
            <td><button type="button"
              onClick={() => onNavigate(file.path, file.longestLineAt, 1)}
              aria-label={'Open longest line in ' + file.path}>
                {file.longestLine} UTF-16 units
              </button></td>
            <td>{file.outgoingImports} / {file.incomingImports}
              {file.unresolvedImports > 0 && <small>{file.unresolvedImports} unresolved</small>}</td>
            <td>{file.reachableFromEntry === null ? 'Unknown' :
              file.reachableFromEntry ? 'Reachable' : 'Not reached'}</td>
          </tr>)}</tbody>
        </table>
      </div>
      {filtered.length === 0 && <p className="project-search-status">
        No source files match the selected metadata filters.
      </p>}
      <div className="workspace-budget-footer">
        <button type="button" onClick={() => setShowLongLines(value => !value)}
          aria-expanded={showLongLines} aria-controls="budget-long-lines">
          {showLongLines ? 'Hide long lines' : 'Show long lines'}
        </button>
        <button type="button" onClick={() => void copySummary()}>Copy source metrics</button>
      </div>
      {showLongLines && <div id="budget-long-lines" className="workspace-budget-long-lines">
        <h3>Lines exceeding 140 UTF-16 units</h3>
        {report.longLines.length === 0
          ? <p>No lines exceed the advisory display threshold.</p>
          : <ol>{report.longLines.map((line, index) => <li key={index}>
            <button type="button" onClick={() => onNavigate(line.path, line.line, 141)}>
              {line.path}:{line.line}
            </button>
            <span>{line.units} UTF-16 units</span>
          </li>)}</ol>}
        {report.longLinesTruncated && <small>Only the first 20 long lines are listed.</small>}
      </div>}
      {notice && <p role="status" className="project-search-status">{notice}</p>}
    </> : <p role="alert">{report.error}</p>}
  </section>;
}
