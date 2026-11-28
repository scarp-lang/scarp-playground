import { useState } from 'react';
import { previewFolderMove, workspaceFolders, type FolderMovePlan } from './folder-move';
import type { Workspace } from './workspace';

type Props = {
  workspace: Workspace;
  onApply: (snapshot: Workspace, plan: Extract<FolderMovePlan, { ok: true }>) => void;
  onClose: () => void;
};

export function FolderMovePanel({ workspace, onApply, onClose }: Props) {
  const folders = workspaceFolders(workspace);
  const [from, setFrom] = useState(folders[0] ?? '');
  const [to, setTo] = useState('');
  const [review, setReview] = useState<FolderMovePlan | null>(null);
  return (
    <section id="folder-move-panel" className="project-search folder-move-panel" aria-label="Move source folder">
      <div className="project-search-bar folder-move-heading">
        <h2>Move source folder</h2>
        <button type="button" onClick={onClose}>Cancel folder move</button>
      </div>
      <p className="project-replace-help">Move all descendant modules at once. Review every path and import change before applying.</p>
      {folders.length === 0 ? <p className="project-search-status">No nested source folders in this workspace.</p> : (
        <form className="folder-move-form" onSubmit={event => {
          event.preventDefault();
          setReview(previewFolderMove(workspace, from, to));
        }}>
          <label>Current folder
            <select value={from} onChange={event => { setFrom(event.target.value); setReview(null); }}>
              {folders.map(folder => <option key={folder} value={folder}>{folder}</option>)}
            </select>
          </label>
          <label>New relative folder path
            <input type="text" value={to} maxLength={122} spellCheck={false} autoComplete="off"
              onChange={event => { setTo(event.target.value); setReview(null); }} placeholder="src/modules" />
          </label>
          <button type="submit" className="button-primary" disabled={!from || !to}>Preview folder move</button>
        </form>
      )}
      {review && !review.ok && <p className="folder-move-error" role="status">{review.error}</p>}
      {review?.ok && <div className="folder-move-review" aria-label="Folder move review">
        <p role="status">Move {review.paths.length} source files and rewrite {review.rewrittenImports} import path(s).</p>
        {review.workspace.entry !== workspace.entry && <p>Entry changes to {review.workspace.entry}.</p>}
        <ul className="folder-move-paths">
          {review.paths.map(path => <li key={path.from}><code>{path.from}</code><span aria-hidden="true">→</span><code>{path.to}</code></li>)}
        </ul>
        <div className="folder-move-diffs">
          {review.lines.map(line => <article key={line.path + ':' + line.line}>
            <strong>{line.path}:{line.line} · {line.imports} import(s)</strong>
            <pre aria-label={'Before move, ' + line.path + ' line ' + line.line}>{line.before}</pre>
            <pre aria-label={'After move, ' + line.path + ' line ' + line.line}>{line.after}</pre>
          </article>)}
        </div>
        <button type="button" className="button-primary" onClick={() => onApply(workspace, review)}>Apply folder move</button>
      </div>}
    </section>
  );
}
