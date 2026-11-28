import { useEffect, useMemo, useState } from 'react';
import type { Workspace } from './workspace';
import { planPreflightActions, summarizeActionPlan, visiblePreflightActions } from './preflight-actions';
import {
  capturePreflightSnapshot, comparePreflightSnapshot,
  filterProjectPreflight, inspectProjectPreflight,
  type PreflightCategory, type PreflightFilter,
  type PreflightReport, type PreflightSeverity, type PreflightSnapshot,
} from './project-preflight';
import './project-preflight.css';

type Props = {
  workspace: Workspace;
  baseline: PreflightSnapshot | null;
  onBaselineChange: (value: PreflightSnapshot | null) => void;
  onNavigate: (path: string, line: number, column: number) => void;
  onClose: () => void;
};

const initialFilter: PreflightFilter = {
  category: 'all', severity: 'all', query: '', path: 'all',
};

export function ProjectPreflightPanel({
  workspace, baseline, onBaselineChange, onNavigate, onClose,
}: Props) {
  const [filter, setFilter] = useState<PreflightFilter>(initialFilter);
  const [showGuidance, setShowGuidance] = useState(true);
  const [compare, setCompare] = useState(false);
  const [showActions, setShowActions] = useState(true);
  const [urgentActionsOnly, setUrgentActionsOnly] = useState(false);
  const [status, setStatus] = useState('');
  const report: PreflightReport = useMemo(() => inspectProjectPreflight(workspace), [workspace]);
  const files = useMemo(() => Object.keys(workspace.files).sort(), [workspace]);
  const results = useMemo(() => filterProjectPreflight(report, filter), [report, filter]);
  const actions = useMemo(() => planPreflightActions(report), [report]);
  const actionSummary = useMemo(() => summarizeActionPlan(actions), [actions]);
  const visibleActions = useMemo(() => visiblePreflightActions(actions, urgentActionsOnly), [actions, urgentActionsOnly]);
  const delta = useMemo(() => compare && baseline
    ? comparePreflightSnapshot(baseline, report) : null,
    [compare, baseline, report]);

  useEffect(() => { setStatus(''); }, [workspace]);

  const update = <K extends keyof PreflightFilter>(key: K, value: PreflightFilter[K]) =>
    setFilter(previous => ({ ...previous, [key]: value }));

  function capture() {
    const snapshot = capturePreflightSnapshot(report);
    if (!snapshot) {
      setStatus('Preflight must be complete before capturing a comparison baseline.');
      return;
    }
    onBaselineChange(snapshot);
    setCompare(false);
    setStatus('Captured private issue metadata as the current preflight baseline.');
  }

  function clear() {
    onBaselineChange(null);
    setCompare(false);
    setStatus('Cleared the preflight comparison baseline.');
  }

  return <section id="project-preflight-panel" className="project-search preflight-panel"
    role="region" aria-label="Project preflight" data-testid="project-preflight-panel">
    <div className="project-search-bar">
      <div className="preflight-heading">
        <h2>Project preflight</h2>
        <p>Review local source hygiene, import edges, capacity and structural risks.</p>
      </div>
      <button type="button" onClick={onClose} aria-label="Close project preflight">Close</button>
    </div>
    <p className="project-replace-help">
      Findings are advisory, non-executing lexical checks. Even a clean preflight
      does not prove that Scarp code compiles. Use the official Rust Check or
      Verify action to test actual language semantics. No source or program
      input is sent, saved, or changed by this panel.
    </p>

    {report.ok ? <>
      <div className="preflight-summary" role="status" aria-label="Preflight summary">
        <span>{report.blockerCount} blocker(s)</span>
        <span>{report.warningCount} warning(s)</span>
        <span>{report.informationCount} information item(s)</span>
        <span>{report.checkedSources} sources</span>
        <span>{report.checkedImports} scanned imports</span>
        <span>{report.totalBytes.toLocaleString()} UTF-8 bytes</span>
      </div>
      {!report.complete && <p role="alert" className="preflight-incomplete">
        The inspection is incomplete. Some missing findings cannot be ruled out;
        review unsupported import syntax or the issue display limit.
      </p>}
      {report.blockerCount === 0 && report.complete && <p className="project-search-status">
        No preflight blockers detected. Compiler verification is still required.
      </p>}

      <div className="preflight-controls">
        <label htmlFor="preflight-query">Search findings</label>
        <input id="preflight-query" type="search" maxLength={96} value={filter.query}
          placeholder="Path, rule or suggested action"
          onChange={event => update('query', event.target.value)}/>
        <label htmlFor="preflight-category">Category</label>
        <select id="preflight-category" value={filter.category}
          onChange={event => update('category', event.target.value as PreflightCategory | 'all')}>
          <option value="all">All categories</option>
          <option value="imports">Local imports</option>
          <option value="hygiene">Source hygiene</option>
          <option value="limits">Source limits</option>
          <option value="structure">Project structure</option>
        </select>
        <label htmlFor="preflight-severity">Severity</label>
        <select id="preflight-severity" value={filter.severity}
          onChange={event => update('severity',
            event.target.value as PreflightSeverity | 'all')}>
          <option value="all">All severities</option>
          <option value="blocker">Preflight blockers</option>
          <option value="warning">Warnings</option>
          <option value="information">Information</option>
        </select>
        <label htmlFor="preflight-file">Source file</label>
        <select id="preflight-file" value={filter.path}
          onChange={event => update('path', event.target.value)}>
          <option value="all">All files and project-level findings</option>
          {files.map(path => <option key={path} value={path}>{path}</option>)}
        </select>
        <label>
          <input type="checkbox" checked={showGuidance}
            onChange={event => setShowGuidance(event.target.checked)}/>
          Show suggested review actions
        </label>
      </div>

      <div className="preflight-results" aria-label="Project preflight findings">
        {results.length === 0 ? <p className="project-search-status">
          No findings match the current filters.
        </p> : <ol>{results.map(issue => <li key={issue.id}
          className={'preflight-severity-' + issue.severity}>
          <div className="preflight-issue-heading">
            <strong>{issue.severity}</strong>
            <span>{issue.category} / {issue.code}</span>
            {issue.path && <button type="button"
              aria-label={'Open preflight issue in ' + issue.path +
                ' line ' + (issue.line ?? 1)}
              onClick={() => onNavigate(issue.path!, issue.line ?? 1, issue.column ?? 1)}>
              {issue.path}:{issue.line ?? 1}:{issue.column ?? 1}
            </button>}
          </div>
          <p>{issue.message}</p>
          {showGuidance && <p className="preflight-guidance">{issue.guidance}</p>}
        </li>)}</ol>}
      </div>

      <section className="preflight-review-plan" aria-label="Suggested review sequence">
        <div className="preflight-review-heading">
          <h3>Suggested next checks</h3>
          <span>{actionSummary.manualReview} review action(s) ·
            {' '}{actionSummary.compilerRequired} compiler-check-dependent action(s)</span>
          <button type="button" aria-expanded={showActions}
            aria-controls="preflight-guided-actions"
            onClick={() => setShowActions(value => !value)}>
            {showActions ? 'Hide review plan' : 'Show review plan'}
          </button>
        </div>
        {showActions && <>
          <label className="preflight-urgent-actions">
            <input type="checkbox" checked={urgentActionsOnly}
              onChange={event => setUrgentActionsOnly(event.target.checked)}/>
            Focus on blockers and warnings (keep compiler verification)
          </label>
          <ol id="preflight-guided-actions">
          {visibleActions.map((action, index) => <li key={action.id}>
            <div>
              <strong>{index + 1}. {action.title}</strong>
              <small>{action.severity} · {action.count} related finding(s)</small>
              {action.firstLocation && <button type="button"
                aria-label={'Open first review location for ' + action.title}
                onClick={() => {
                  const target = action.firstLocation!;
                  onNavigate(target.path, target.line, target.column);
                }}>
                Open first source location
              </button>}
            </div>
            <p>{action.instruction}</p>
            {action.paths.length > 0 && <small>
              {action.paths.length} relevant file(s): {action.paths.slice(0, 4).join(', ')}
              {action.paths.length > 4 ? ', …' : ''}
            </small>}
          </li>)}
        </ol></>}
        <p className="project-replace-help">This checklist is guidance only;
          it never changes code, runs the compiler or dismisses findings.</p>
      </section>

      <div className="preflight-baseline">
        <h3>Compare preflight changes</h3>
        <p>Store issue identifiers and severity only in this browser tab, then
          inspect introduced/resolved findings after editing. No full source text is kept.</p>
        <div>
          <button type="button" disabled={!report.complete} onClick={capture}>
            Capture preflight baseline
          </button>
          <button type="button" disabled={!baseline || !report.complete}
            onClick={() => setCompare(true)}>Compare with baseline</button>
          <button type="button" disabled={!baseline} onClick={clear}>
            Clear preflight baseline
          </button>
        </div>
        {baseline && <small>Baseline captured with {baseline.issues.length} finding(s)
          across {baseline.sourceCount} source files.</small>}
        {delta && <div className="preflight-delta" aria-label="Preflight change summary">
          <h3>{delta.introduced.length} introduced · {delta.resolved.length} resolved ·
            {' '}{delta.unchanged} unchanged</h3>
          {delta.truncated && <p>Only the first 80 introduced/resolved findings are shown.</p>}
          <div className="preflight-delta-sections">
            <section><h4>Introduced</h4>
              <ol>{delta.introduced.map(issue => <li key={issue.id}>
                <strong>{issue.severity}</strong> · {issue.code}
                {' '}{issue.path ?? 'project'}:{issue.line ?? 0}
              </li>)}</ol>
            </section>
            <section><h4>Resolved</h4>
              <ol>{delta.resolved.map(issue => <li key={issue.id}>
                <strong>{issue.severity}</strong> · {issue.code}
                {' '}{issue.path ?? 'project'}:{issue.line ?? 0}
              </li>)}</ol>
            </section>
          </div>
        </div>}
      </div>
    </> : <p role="alert">{report.error}</p>}
    {status && <p role="status" className="project-search-status">{status}</p>}
  </section>;
}
