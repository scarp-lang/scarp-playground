import { useEffect, useMemo, useState } from 'react';
import type { Workspace } from './workspace';
import {
  MAX_SCAFFOLD_REQUESTS, previewBatchScaffold,
  type ScaffoldKind, type ScaffoldPlan, type ScaffoldRequest,
} from './batch-scaffold';
import './batch-scaffold.css';

type Props = {
  workspace: Workspace;
  onApply: (snapshot: Workspace, requests: ScaffoldRequest[],
    plan: Extract<ScaffoldPlan, { ok: true }>) => void;
  onClose: () => void;
};
type Reviewed = {
  workspace: Workspace;
  requests: ScaffoldRequest[];
  plan: ScaffoldPlan;
};

const kinds: Array<{ value: ScaffoldKind; label: string }> = [
  { value: 'empty', label: 'Empty .srp file' },
  { value: 'comment', label: 'Comment-only starter file' },
  { value: 'clone', label: 'Copy existing Scarp file' },
  { value: 'custom', label: 'Use custom source text' },
];
const emptyRequest = (index: number): ScaffoldRequest => ({
  path: 'lib/new_module_' + index + '.srp', kind: 'comment',
});

export function BatchScaffoldPanel({ workspace, onApply, onClose }: Props) {
  const [requests, setRequests] = useState<ScaffoldRequest[]>([emptyRequest(1)]);
  const [review, setReview] = useState<Reviewed | null>(null);
  const [message, setMessage] = useState('');
  const files = useMemo(() => Object.keys(workspace.files).sort(), [workspace]);
  const remaining = 12 - files.length;
  const plan = review?.workspace === workspace && review.plan.ok ? review.plan : null;
  useEffect(() => { setReview(null); setMessage(''); }, [workspace]);

  function edit(index: number, change: Partial<ScaffoldRequest>) {
    setRequests(current => current.map((item, at) =>
      at === index ? { ...item, ...change } : item));
    setReview(null);
  }

  function add() {
    setRequests(current => current.length >= Math.min(MAX_SCAFFOLD_REQUESTS, remaining)
      ? current : [...current, emptyRequest(current.length + 1)]);
    setReview(null);
  }

  function remove(index: number) {
    setRequests(current => current.length === 1
      ? current : current.filter((_, at) => at !== index));
    setReview(null);
  }

  function preview() {
    const planned = previewBatchScaffold(workspace, requests);
    setReview({ workspace, requests: requests.map(item => ({ ...item })), plan: planned });
    setMessage(planned.ok ? 'Review every generated filename and source excerpt before applying.' :
      planned.error);
  }

  function apply() {
    if (!plan || !review || review.workspace !== workspace) {
      setMessage('The scaffold plan is stale. Preview the current workspace.');
      return;
    }
    if (!window.confirm('Add ' + plan.added.length + ' selected source files to this ' +
      'Scarp project? Existing files and the entrypoint will remain unchanged. ' +
      'Use Undo bulk change to revert the addition.')) return;
    onApply(review.workspace, review.requests, plan);
    setReview(null);
  }

  return <section className="project-search batch-scaffold-panel"
    id="batch-scaffold-panel" role="region"
    aria-label="Batch source scaffold" data-testid="batch-scaffold-panel">
    <div className="project-search-bar">
      <div className="batch-scaffold-heading">
        <h2>Batch source scaffold</h2>
        <p>Create several local Scarp files together, with explicit preview and undo.</p>
      </div>
      <button type="button" aria-label="Close batch scaffold" onClick={onClose}>Close</button>
    </div>
    <p className="project-replace-help">
      Scaffolds are additive. No existing file or the entrypoint is modified.
      Cloned files may need their relative imports fixed. Custom text and
      comment-only templates are not compiler-validated until Check or Run.
    </p>
    <div className="batch-scaffold-summary" role="status" aria-label="Batch scaffold summary">
      <span>{files.length} existing Scarp files</span>
      <span>{remaining} available slots</span>
      <span>{requests.length} selected new files</span>
    </div>
    <div className="batch-scaffold-requests">
      {requests.map((request, index) => <fieldset key={index}>
        <legend>New file {index + 1}</legend>
        <label htmlFor={'scaffold-path-' + index}>New relative .srp path</label>
        <input id={'scaffold-path-' + index} type="text" maxLength={128}
          spellCheck={false} value={request.path}
          onChange={event => edit(index, { path: event.target.value })}/>
        <label htmlFor={'scaffold-kind-' + index}>Source template</label>
        <select id={'scaffold-kind-' + index} value={request.kind}
          onChange={event => edit(index, { kind: event.target.value as ScaffoldKind })}>
          {kinds.map(kind => <option key={kind.value} value={kind.value}>
            {kind.label}
          </option>)}
        </select>
        {request.kind === 'clone' && <>
          <label htmlFor={'scaffold-from-' + index}>Copy from existing file</label>
          <select id={'scaffold-from-' + index} value={request.from ?? ''}
            onChange={event => edit(index, { from: event.target.value })}>
            <option value="">Select source file…</option>
            {files.map(path => <option key={path} value={path}>{path}</option>)}
          </select>
        </>}
        {request.kind === 'custom' && <>
          <label htmlFor={'scaffold-custom-' + index}>Source text (max 64 KiB)</label>
          <textarea id={'scaffold-custom-' + index} rows={4}
            maxLength={64 * 1024} spellCheck={false} value={request.content ?? ''}
            placeholder="Enter Scarp code or comments for the new module"
            onChange={event => edit(index, { content: event.target.value })}/>
        </>}
        <button type="button" disabled={requests.length === 1}
          onClick={() => remove(index)}>Remove new file {index + 1}</button>
      </fieldset>)}
    </div>
    <div className="batch-scaffold-actions">
      <button type="button" disabled={requests.length >= MAX_SCAFFOLD_REQUESTS ||
        requests.length >= remaining} onClick={add}>
        Add another new file
      </button>
      <button type="button" className="button-primary" disabled={!remaining}
        onClick={preview}>Preview batch file creation</button>
    </div>
    {review && review.workspace !== workspace &&
      <p role="status">Workspace changed. Preview new files again.</p>}
    {review && review.workspace === workspace && !review.plan.ok &&
      <p role="alert">{review.plan.error}</p>}
    {plan && <section className="batch-scaffold-review"
      aria-label="Scaffold addition preview">
      <h3>Reviewed new source files</h3>
      <p>{plan.added.length} additions · {plan.totalNewBytes.toLocaleString()}
        {' '}UTF-8 bytes · {plan.remainingSlots} free file slots remain.</p>
      <ol>{plan.added.map(item => <li key={item.path}>
        <strong>{item.path}</strong>
        <span>{item.kind} · {item.bytes} bytes · {item.lines} line(s)</span>
        {item.caution && <p>{item.caution}</p>}
        {item.preview && <pre>{item.preview}</pre>}
        {item.previewTruncated && <small>Preview excerpt shortened.</small>}
      </li>)}</ol>
      <button type="button" className="button-primary" onClick={apply}>
        Apply reviewed batch scaffold
      </button>
    </section>}
    {message && <p role="status" className="project-search-status">{message}</p>}
  </section>;
}
