import { useMemo, useState } from 'react';
import { compareWorkspaceCheckpoint, type SourceCheckpoint } from './source-checkpoint';
import { diffSource } from './source-diff';
import type { Workspace } from './workspace';

type Props = {
  workspace: Workspace;
  snapshot: SourceCheckpoint | null;
  onCapture: () => void;
  onRestore: () => void;
  onDiscard: () => void;
  onClose: () => void;
};

export function SourceCheckpointPanel({ workspace, snapshot, onCapture, onRestore, onDiscard, onClose }: Props) {
  const [selected, setSelected] = useState('');
  const comparison = useMemo(() => snapshot ? compareWorkspaceCheckpoint(snapshot, workspace) : null,
    [snapshot, workspace]);
  const changed = comparison?.files.filter(file => file.status !== 'unchanged') ?? [];
  const path = changed.some(file => file.path === selected) ? selected : changed[0]?.path ?? '';
  const diff = useMemo(() => snapshot && path ?
    diffSource(Object.hasOwn(snapshot.workspace.files, path) ? snapshot.workspace.files[path] : null,
      Object.hasOwn(workspace.files, path) ? workspace.files[path] : null) : null,
    [snapshot, workspace, path]);
  const entryChanged = comparison && comparison.entryBefore !== comparison.entryAfter;
  return (
    <section id="source-checkpoint-panel" className="project-search source-checkpoint-panel" aria-label="Source checkpoint">
      <div className="project-search-bar source-checkpoint-heading">
        <h2>Source checkpoint</h2>
        <button type="button" onClick={onClose}>Close checkpoint</button>
      </div>
      <p className="project-replace-help">
        Capture a temporary source-only checkpoint, inspect changes, and restore with confirmation.
        It stays in this tab's memory and is not a saved project, file history or backup.
      </p>
      <div className="source-checkpoint-actions">
        <button type="button" className="button-primary" onClick={onCapture}>{snapshot ? 'Replace checkpoint' : 'Capture checkpoint'}</button>
        <button type="button" disabled={!snapshot} onClick={onDiscard}>Discard checkpoint</button>
        <button type="button" disabled={!comparison || (!comparison.changed && !entryChanged)} onClick={onRestore}>Restore checkpoint</button>
      </div>
      {!snapshot ? <p className="project-search-status">No checkpoint captured.</p> : !comparison ?
        <p className="project-search-status" role="status">Current source cannot be compared within workspace limits.</p> : (
        <>
          <p role="status" className="project-search-status">{comparison.changed} changed source files · {comparison.files.length} compared paths</p>
          {entryChanged && <p className="project-search-status">Entry: {comparison.entryBefore} → {comparison.entryAfter}</p>}
          <ul className="source-checkpoint-files">
            {comparison.files.map(file => <li key={file.path}>
              <button type="button" disabled={file.status === 'unchanged'} aria-pressed={path === file.path}
                onClick={() => setSelected(file.path)} aria-label={'Compare ' + file.path}>
                <strong>{file.path}</strong><span>{file.status} · {file.beforeBytes} → {file.afterBytes} B</span>
              </button>
            </li>)}
          </ul>
          {diff && <section className="source-diff" aria-label={'Changes in ' + path}>
            <h3>{path}</h3>
            <p className="project-search-status">Old line · New line · Source · Line ending</p>
            {diff.error && <p role="status">{diff.error}</p>}
            {diff.approximate && <p role="status">Large change: simplified removal/addition preview.</p>}
            <div className="source-diff-rows">
              {diff.rows.map((row, index) => <div key={index} className={'source-diff-row ' + row.kind}>
                <span>{row.before ?? ''}</span><span>{row.after ?? ''}</span>
                <span aria-hidden="true">{row.kind === 'added' ? '+' : row.kind === 'removed' ? '−' : ' '}</span>
                <code>{row.text}{row.truncated ? '… [line truncated]' : ''}</code>
                <span className="source-diff-ending">{row.ending}</span>
              </div>)}
            </div>
            {diff.omitted > 0 && <p className="project-search-status">{diff.omitted} line rows omitted from display.</p>}
            {!diff.error && !diff.rows.length && <p className="project-search-status">No text lines to display (empty source file).</p>}
          </section>}
        </>
      )}
    </section>
  );
}
