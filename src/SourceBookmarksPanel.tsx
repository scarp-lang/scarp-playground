import { useMemo, useState } from 'react';
import type { Workspace } from './workspace';
import {
  MAX_SOURCE_BOOKMARKS, addSourceBookmark, renameSourceBookmark,
  deleteSourceBookmark, moveSourceBookmark, validSourcePoint,
  type SourceBookmark, type SourcePoint, type SourceTrail,
} from './source-navigation';
import './source-bookmarks.css';

type Props = {
  workspace: Workspace;
  bookmarks: readonly SourceBookmark[];
  trail: SourceTrail;
  getCursorPosition: () => SourcePoint;
  onChange: (next: SourceBookmark[]) => void;
  onJump: (point: SourcePoint) => void;
  onBack: () => void;
  onForward: () => void;
  onClose: () => void;
};

export function SourceBookmarksPanel({
  workspace, bookmarks, trail, getCursorPosition, onChange,
  onJump, onBack, onForward, onClose,
}: Props) {
  const [label, setLabel] = useState('');
  const [drafts, setDrafts] = useState<Record<number, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const visible = useMemo(() => bookmarks.filter(bookmark =>
    (bookmark.label + ' ' + bookmark.point.path + ':' + bookmark.point.line)
      .toLocaleLowerCase().includes(query.toLocaleLowerCase())),
  [bookmarks, query]);

  function addAtCursor() {
    const point = getCursorPosition();
    const result = addSourceBookmark(workspace, bookmarks, point, label.trim() || undefined);
    if (!result.ok) { setMessage(result.error); return; }
    onChange(result.bookmarks);
    setMessage('Bookmarked ' + point.path + ':' + point.line + ':' + point.column + '.');
    setLabel('');
  }

  function rename(id: number) {
    const bookmark = bookmarks.find(item => item.id === id);
    if (!bookmark) return;
    const value = drafts[id] ?? bookmark.label;
    const result = renameSourceBookmark(workspace, bookmarks, id, value);
    if (!result.ok) { setMessage(result.error); return; }
    onChange(result.bookmarks);
    setDrafts(previous => {
      const next = { ...previous };
      delete next[id];
      return next;
    });
    setMessage('Bookmark label updated.');
  }

  function remove(id: number) {
    const result = deleteSourceBookmark(workspace, bookmarks, id);
    if (!result.ok) { setMessage(result.error); return; }
    onChange(result.bookmarks);
    setMessage('Bookmark removed.');
  }

  function move(id: number, direction: -1 | 1) {
    const result = moveSourceBookmark(workspace, bookmarks, id, direction);
    if (!result.ok) { setMessage(result.error); return; }
    onChange(result.bookmarks);
    setMessage(null);
  }

  function clear() {
    if (bookmarks.length && !window.confirm(
      'Remove all source bookmarks from this browser session? No source code will change.',
    )) return;
    onChange([]);
    setMessage('Session bookmarks cleared.');
  }

  return <section className="project-search source-bookmarks-panel"
    id="source-bookmarks-panel" role="region"
    aria-label="Source bookmarks and navigation" data-testid="source-bookmarks-panel">
    <div className="project-search-bar">
      <div className="bookmark-heading">
        <h2>Bookmarks and navigation</h2>
        <p>Remember locations in the open project. No source or bookmarks are sent to a server.</p>
      </div>
      <button type="button" onClick={onClose} aria-label="Close source bookmarks">Close</button>
    </div>

    <div className="bookmark-history-actions">
      <button type="button" onClick={onBack} disabled={trail.back.length === 0}
        aria-label="Navigate backward">Back</button>
      <button type="button" onClick={onForward} disabled={trail.forward.length === 0}
        aria-label="Navigate forward">Forward</button>
      <p role="status">{trail.back.length} previous location(s) ·
        {' '}{trail.forward.length} forward location(s)</p>
    </div>

    <div className="bookmark-add">
      <h3>Add source bookmark</h3>
      <p>The current editor cursor is captured when you select Add.</p>
      <div className="bookmark-input-row">
        <label htmlFor="bookmark-label">Optional bookmark name</label>
        <input id="bookmark-label" type="text" value={label} maxLength={80}
          placeholder="e.g. Entry logic" onChange={event => setLabel(event.target.value)} />
        <button type="button" className="button-primary" onClick={addAtCursor}
          disabled={bookmarks.length >= MAX_SOURCE_BOOKMARKS}>
          Add at cursor
        </button>
      </div>
    </div>

    <div className="bookmark-list-heading">
      <h3>Saved locations ({bookmarks.length}/{MAX_SOURCE_BOOKMARKS})</h3>
      <label htmlFor="bookmark-search">Find bookmark</label>
      <input id="bookmark-search" type="search" value={query} maxLength={80}
        onChange={event => setQuery(event.target.value)} placeholder="Name or file path…" />
    </div>
    {bookmarks.length === 0 ? (
      <p role="status" className="project-search-status">
        No bookmarks yet. Place the editor cursor on a line and select Add at cursor.
      </p>
    ) : visible.length === 0 ? (
      <p role="status" className="project-search-status">No bookmarks match this search.</p>
    ) : <ol className="bookmark-list">
      {visible.map(bookmark => {
        const position = bookmark.point;
        const index = bookmarks.findIndex(item => item.id === bookmark.id);
        const valid = validSourcePoint(workspace, position);
        return <li key={bookmark.id} className="bookmark-item">
          <div className="bookmark-details">
            <button type="button" className="bookmark-jump" disabled={!valid}
              aria-label={'Open bookmark ' + bookmark.label + ' at ' +
                position.path + ' line ' + position.line + ' column ' + position.column}
              onClick={() => onJump(position)}>
              {bookmark.label}
            </button>
            <span>{position.path}:{position.line}:{position.column}</span>
          </div>
          <div className="bookmark-edit">
            <label htmlFor={'bookmark-rename-' + bookmark.id}>Rename bookmark {bookmark.id}</label>
            <input id={'bookmark-rename-' + bookmark.id} type="text"
              maxLength={80} value={drafts[bookmark.id] ?? bookmark.label}
              onChange={event => setDrafts(previous => ({ ...previous, [bookmark.id]: event.target.value }))}/>
            <button type="button" onClick={() => rename(bookmark.id)}
              disabled={drafts[bookmark.id] === undefined || drafts[bookmark.id] === bookmark.label}>
              Save name
            </button>
            <button type="button" onClick={() => move(bookmark.id, -1)}
              disabled={index <= 0} aria-label={'Move ' + bookmark.label + ' up'}>↑</button>
            <button type="button" onClick={() => move(bookmark.id, 1)}
              disabled={index === bookmarks.length - 1} aria-label={'Move ' + bookmark.label + ' down'}>↓</button>
            <button type="button" onClick={() => remove(bookmark.id)}
              aria-label={'Delete bookmark ' + bookmark.label}>Delete</button>
          </div>
        </li>;
      })}
    </ol>}
    <div className="bookmark-bottom">
      <button type="button" disabled={bookmarks.length === 0} onClick={clear}>
        Clear session bookmarks
      </button>
      {message && <p role="status">{message}</p>}
    </div>
  </section>;
}
