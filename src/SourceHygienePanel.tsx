import { useMemo, useState } from 'react';
import type { Workspace } from './workspace';
import './source-hygiene.css';
import { diffSource } from './source-diff';
import {
  analyzeSourceHygiene, filterSourceHygiene, planSourceHygieneCleanup,
  MAX_HYGIENE_QUERY, type HygieneSeverity,
} from './source-hygiene';

type Props = {
  workspace: Workspace;
  onClose: () => void;
  onNavigate: (path: string, line: number, column: number) => void;
  onApply: (snapshot: Workspace, cleaned: Workspace) => void;
};

type SeverityFilter = HygieneSeverity | 'all';

/**
 * Local-only advisory inspector. Results are never persisted, sent to a
 * service or automatically used as a compiler diagnostic.
 */
export function SourceHygienePanel({ workspace, onClose, onNavigate, onApply }: Props) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<SeverityFilter>('all');
  const [previewing, setPreviewing] = useState(false);
  const [previewPath, setPreviewPath] = useState<string | null>(null);
  const report = useMemo(() => analyzeSourceHygiene(workspace), [workspace]);
  const plan = useMemo(() => planSourceHygieneCleanup(workspace), [workspace]);
  const filtered = useMemo(() => report.ok
    ? filterSourceHygiene(report.issues, query, filter) : [],
  [report, query, filter]);
  const selectedFile = plan.ok
    ? plan.changedFiles.includes(previewPath ?? '') ? previewPath! : plan.changedFiles[0]
    : null;
  const preview = useMemo(() => plan.ok && selectedFile
    ? diffSource(workspace.files[selectedFile], plan.workspace.files[selectedFile]) : null,
  [workspace, plan, selectedFile]);

  function confirmApply() {
    if (!plan.ok) return;
    const message = 'Apply reviewed source-hygiene fixes to ' + plan.changedFiles.length +
      ' source file(s)? This changes only whitespace outside known string literals and ' +
      'eligible line endings. Suspicious Unicode is never removed automatically.';
    if (!window.confirm(message)) return;
    onApply(workspace, plan.workspace);
  }

  return <section id="source-hygiene-panel" className="project-search source-hygiene-panel"
    aria-label="Source hygiene inspector" data-testid="source-hygiene-panel">
    <div className="project-search-bar">
      <div className="hygiene-heading">
        <h2>Source hygiene and Unicode safety</h2>
        <p>Local advisory inspection · Rust remains authoritative for Scarp syntax and types.</p>
      </div>
      <button type="button" aria-label="Close source hygiene" onClick={onClose}>Close</button>
    </div>
    {!report.ok ? (
      <p role="alert">{report.error}</p>
    ) : <>
      <div className="hygiene-summary" aria-label="Source hygiene summary" role="status">
        <span>Security: <strong>{report.counts.security}</strong></span>
        <span>Warnings: <strong>{report.counts.warning}</strong></span>
        <span>Style: <strong>{report.counts.info}</strong></span>
        <span>Safe fixes: <strong>{report.fixable}</strong></span>
        {report.truncated && <span>First 400 findings shown</span>}
      </div>
      <div className="hygiene-filters">
        <label htmlFor="source-hygiene-query">Find source finding</label>
        <input id="source-hygiene-query" value={query} type="search"
          onChange={event => setQuery(event.target.value)}
          maxLength={MAX_HYGIENE_QUERY} placeholder="Filename, rule or description…"/>
        <label htmlFor="source-hygiene-severity">Severity</label>
        <select id="source-hygiene-severity"
          value={filter} onChange={event => setFilter(event.target.value as SeverityFilter)}>
          <option value="all">All severity levels</option>
          <option value="security">Security</option>
          <option value="warning">Warning</option>
          <option value="info">Style information</option>
        </select>
      </div>
      {filtered.length === 0
        ? <p className="project-search-status" role="status">No findings match these filters.</p>
        : <div className="hygiene-findings" aria-label="Source hygiene findings">
          {filtered.map((item, index) => <button type="button"
            key={item.path + ':' + item.line + ':' + item.column + ':' + item.rule + ':' + index}
            className={'hygiene-finding severity-' + item.severity}
            onClick={() => onNavigate(item.path, item.line, item.column)}
            aria-label={'Open ' + item.path + ' line ' + item.line + ' column ' + item.column +
              ': ' + item.message}>
            <span className="hygiene-finding-location">{item.path}:{item.line}:{item.column}</span>
            <span className="hygiene-finding-rule">{item.rule}</span>
            <span className="hygiene-finding-message">{item.message}</span>
            <span className="hygiene-finding-fix">{item.fixable ? 'Safe fix available' : 'Review manually'}</span>
          </button>)}
        </div>}
    </>}

    <div className="hygiene-repair">
      <div className="project-search-bar">
        <div>
          <h3>Safe cleanup</h3>
          <p>Only whitespace changes are eligible. Review the exact source diff first.</p>
        </div>
        <button type="button" disabled={!plan.ok} aria-expanded={previewing}
          onClick={() => setPreviewing(value => !value)}>
          {previewing ? 'Hide cleanup preview' : 'Preview safe cleanup'}
        </button>
      </div>
      {!plan.ok && <p className="project-search-status">{plan.error}</p>}
      {previewing && plan.ok && <>
        <p className="hygiene-plan-summary" role="status">
          {plan.changedFiles.length} file(s) · {plan.trimmedLines} trimmed line(s) ·
          {' '}{plan.finalNewlines} final newline(s) · {plan.normalizedFiles} newline normalization(s)
        </p>
        <label htmlFor="hygiene-preview-file">Preview changed file</label>
        <select id="hygiene-preview-file" value={selectedFile ?? ''}
          onChange={event => setPreviewPath(event.target.value)}>
          {plan.changedFiles.map(path => <option key={path} value={path}>{path}</option>)}
        </select>
        {preview?.error
          ? <p role="alert">{preview.error}</p>
          : <div className="hygiene-diff" aria-label="Safe source cleanup diff">
            {preview?.rows.map((row, index) => (
              <div key={index} className={'hygiene-diff-' + row.kind}>
                <span className="hygiene-diff-line">{row.before ?? '–'} / {row.after ?? '–'}</span>
                <span className="hygiene-diff-sign">{row.kind === 'added' ? '+' : row.kind === 'removed' ? '−' : ' '}</span>
                <code>{row.text}{row.truncated ? '…' : ''}</code>
                <span className="hygiene-diff-ending">{row.ending}</span>
              </div>
            ))}
            {preview && preview.omitted > 0 && <p>{preview.omitted} unchanged or excess diff row(s) omitted.</p>}
            {preview?.approximate && <p>Large diff: the preview uses bounded approximation.</p>}
          </div>}
        <div className="hygiene-confirm">
          <button type="button" className="button-primary" disabled={!!preview?.error}
            onClick={confirmApply}>Apply reviewed cleanup</button>
          <small>This is an atomic source edit. The command palette can undo it until the next edit.</small>
        </div>
      </>}
    </div>
  </section>;
}
