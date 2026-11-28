import { useMemo, useState } from 'react';
import {
  previewBatchModuleMove, summarizeBatchModuleMove, describeBatchModuleMove,
  type BatchMoveEntry, type BatchMovePlan,
} from './batch-module-move';
import type { Workspace } from './workspace';
import './batch-module-move.css';

type Props = {
  workspace: Workspace;
  activeFile: string;
  onApply: (snapshot: Workspace, plan: Extract<BatchMovePlan, { ok: true }>) => void;
  onClose: () => void;
};

type Review = Readonly<{ snapshot: Workspace; plan: BatchMovePlan }>;
const MAX_PREVIEW_LINE = 320;

function displayLine(value: string): string {
  return value.length <= MAX_PREVIEW_LINE ? value : value.slice(0, MAX_PREVIEW_LINE) + '… [truncated]';
}

export function BatchModuleMovePanel({ workspace, activeFile, onApply, onClose }: Props) {
  const paths = useMemo(() => Object.keys(workspace.files).sort(), [workspace]);
  const [destinations, setDestinations] = useState<Record<string, string>>({});
  const [review, setReview] = useState<Review | null>(null);
  const [showImportProof, setShowImportProof] = useState(false);
  const changed = paths.filter(path => (destinations[path] ?? path) !== path);
  const cleanReview = review?.snapshot === workspace ? review.plan : null;
  const plan = cleanReview?.ok ? cleanReview : null;
  const summary = plan ? summarizeBatchModuleMove(workspace, plan) : null;

  function updateDestination(path: string, to: string) {
    setDestinations(previous => ({ ...previous, [path]: to }));
    setReview(null);
  }

  function reset() {
    setDestinations({});
    setReview(null);
    setShowImportProof(false);
  }

  function preview() {
    const rows: BatchMoveEntry[] = paths.map(from => ({ from, to: destinations[from] ?? from }));
    setReview({
      snapshot: workspace,
      plan: previewBatchModuleMove(workspace, rows, activeFile),
    });
  }

  function apply() {
    if (!review || !plan || review.snapshot !== workspace) return;
    if (!window.confirm(
      'Atomically rename ' + plan.moves.length +
      ' source file(s) and update ' + plan.rewrittenImports +
      ' import reference(s)? This changes source files and paths. ' +
      'Undo bulk change can reverse this operation until the next edit.',
    )) return;
    onApply(review.snapshot, plan);
    reset();
  }

  return <section id="batch-module-move-panel" className="project-search batch-move-panel"
    aria-label="Batch source file rename" data-testid="batch-module-move-panel">
    <div className="project-search-bar">
      <div className="batch-move-heading">
        <h2>Batch source file rename</h2>
        <p>Relocate several Scarp modules simultaneously, preserving their local imports.</p>
      </div>
      <button type="button" onClick={onClose} aria-label="Close batch file rename">Close</button>
    </div>
    <p className="project-replace-help">
      Choose the destination paths. Unchanged files keep their names. Swaps are supported.
      A preview must prove every existing local import resolves before changes can be applied.
    </p>

    <form onSubmit={event => { event.preventDefault(); preview(); }}>
      <div className="batch-move-rows" aria-label="Source file rename mappings">
        {paths.map(path => <div className="batch-move-row" key={path}>
          <label htmlFor={'batch-move-' + path}>Destination for {path}</label>
          <span className="batch-move-from">{path}</span>
          <span aria-hidden="true">→</span>
          <input id={'batch-move-' + path} type="text"
            maxLength={128} spellCheck={false} autoComplete="off"
            value={destinations[path] ?? path} onChange={event => updateDestination(path, event.target.value)}
          />
        </div>)}
      </div>
      <div className="batch-move-actions">
        <span role="status">{changed.length} requested filename change(s)</span>
        <button type="submit" className="button-primary" disabled={!changed.length}>Preview batch rename</button>
        <button type="button" onClick={reset}>Reset paths</button>
      </div>
    </form>

    {cleanReview && !cleanReview.ok && <p role="alert" className="batch-move-error">{cleanReview.error}</p>}
    {review && review.snapshot !== workspace && <p role="status" className="batch-move-error">
      Source changed after the preview. Review the current workspace again.
    </p>}
    {plan && <div className="batch-move-preview" aria-label="Reviewed batch rename">
      <p role="status" className="batch-move-summary">{describeBatchModuleMove(plan)}</p>
      {summary?.entryChanged && <p>New entrypoint: {plan.workspace.entry}</p>}
      {summary?.activeFileChanged && <p>New active file: {plan.nextActiveFile}</p>}
      <h3>Proposed file paths</h3>
      <ul className="batch-move-mappings">
        {plan.moves.map(move => <li key={move.from}>
          <code>{move.from}</code><span aria-hidden="true">→</span><code>{move.to}</code>
        </li>)}
      </ul>

      <h3>Updated import statements</h3>
      {plan.lines.length === 0
        ? <p className="project-search-status">No import strings require changes.</p>
        : <div className="batch-move-diffs">
          {plan.lines.map(line => <article key={line.path + ':' + line.line}>
            <strong>{line.path}:{line.line} · {line.imports} import(s)</strong>
            <pre aria-label={'Before batch rename, ' + line.path + ' line ' + line.line}>
              {displayLine(line.before)}</pre>
            <pre aria-label={'After batch rename, ' + line.path + ' line ' + line.line}>
              {displayLine(line.after)}</pre>
          </article>)}
        </div>}

      <button type="button" className="batch-move-proof-toggle" aria-expanded={showImportProof}
        onClick={() => setShowImportProof(show => !show)}>
        {showImportProof ? 'Hide' : 'Show'} verified import mappings ({plan.verifiedReferences.length})
      </button>
      {showImportProof && (
        <div className="batch-move-proof" aria-label="Verified unchanged module references">
          <p>Only resolved local import identities are displayed. File source is not included.</p>
          <ul>{plan.verifiedReferences.map((edge, index) =>
            <li key={edge.importer + ':' + index}>
              <code>{edge.importer}</code>{' → '}<code>{edge.oldTarget}</code>
              {' becomes '}<code>{edge.nextImporter}</code>{' → '}<code>{edge.nextTarget}</code>
            </li>)}</ul>
        </div>
      )}
      <p className="batch-move-note">
        The preview is atomic and local. No file content is written, executed, uploaded,
        or saved until you explicitly confirm Apply.
      </p>
      <button type="button" className="button-primary" onClick={apply}>Apply batch rename</button>
    </div>}
  </section>;
}
