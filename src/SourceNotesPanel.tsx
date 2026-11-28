import { useMemo, useState } from 'react';
import type { Workspace } from './workspace';
import {
  DEFAULT_SOURCE_NOTE_FILTER, MAX_SOURCE_NOTES,
  SOURCE_NOTE_CATEGORIES, createSourceNote, updateSourceNote,
  setSourceNoteResolved, deleteSourceNote, clearSourceNotes,
  filterSourceNotes, sourceNotesSummary, validSourceNotePoint,
  type SourceNoteCategory, type SourceNotes, type SourceNote,
  type SourceNotePoint, type SourceNoteFilter,
} from './source-notes';
import './source-notes.css';

type Props = {
  workspace: Workspace;
  activeFile: string;
  notes: SourceNotes;
  onChange: (notes: SourceNotes) => void;
  onNavigate: (point: SourceNotePoint) => void;
  onClose: () => void;
};

const names: Record<SourceNoteCategory, string> = {
  idea: 'Idea', question: 'Question', bug: 'Bug investigation', learning: 'Learning note',
};

export function SourceNotesPanel({
  workspace, activeFile, notes, onChange, onNavigate, onClose,
}: Props) {
  const [file, setFile] = useState(activeFile);
  const [line, setLine] = useState('1');
  const [column, setColumn] = useState('1');
  const [category, setCategory] = useState<SourceNoteCategory>('idea');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [filter, setFilter] = useState<SourceNoteFilter>(DEFAULT_SOURCE_NOTE_FILTER);
  const [message, setMessage] = useState<string | null>(null);

  const files = useMemo(() => Object.keys(workspace.files).sort(), [workspace]);
  const summary = useMemo(() => sourceNotesSummary(workspace, notes), [workspace, notes]);
  const shown = useMemo(() => filterSourceNotes(workspace, notes, filter),
    [workspace, notes, filter]);
  const selectedFile = files.includes(file) ? file : workspace.entry;

  const changeFilter = <K extends keyof SourceNoteFilter>(
    key: K, value: SourceNoteFilter[K],
  ) => setFilter(current => ({ ...current, [key]: value }));

  function resetEditor() {
    setEditingId(null);
    setFile(workspace.entry);
    setLine('1');
    setColumn('1');
    setCategory('idea');
    setTitle('');
    setBody('');
  }

  function save() {
    const point: SourceNotePoint = {
      path: selectedFile, line: Number(line), column: Number(column),
    };
    const change = { title, body, category, point };
    const result = editingId === null
      ? createSourceNote(workspace, notes, change)
      : updateSourceNote(workspace, notes, editingId, change);
    if (!result.ok) { setMessage(result.error); return; }
    onChange(result.notes);
    setMessage(editingId === null ? 'Added a private session source note.' : 'Source note updated.');
    resetEditor();
  }

  function edit(note: SourceNote) {
    setEditingId(note.id);
    setFile(note.point.path);
    setLine(String(note.point.line));
    setColumn(String(note.point.column));
    setTitle(note.title);
    setBody(note.body);
    setCategory(note.category);
    setMessage(null);
  }

  function toggle(note: SourceNote) {
    const result = setSourceNoteResolved(notes, note.id, !note.resolved);
    if (!result.ok) { setMessage(result.error); return; }
    onChange(result.notes);
    setMessage(note.resolved ? 'Source note reopened.' : 'Source note marked resolved.');
  }

  function discard(note: SourceNote) {
    if (!window.confirm('Discard "' + note.title + '" from this browser tab?')) return;
    const result = deleteSourceNote(notes, note.id);
    if (!result.ok) { setMessage(result.error); return; }
    onChange(result.notes);
    if (editingId === note.id) resetEditor();
    setMessage('Source note discarded.');
  }

  function clear() {
    if (notes.items.length && !window.confirm('Discard every source note from this browser tab?')) return;
    onChange(clearSourceNotes(notes));
    resetEditor();
    setMessage('Cleared all session source notes.');
  }

  return <section className="project-search source-notes-panel"
    id="source-notes-panel" role="region" aria-label="Session source notes"
    data-testid="source-notes-panel">
    <div className="project-search-bar">
      <div className="source-note-intro">
        <h2>Source notes</h2>
        <p>Attach a private explanation, question, or investigation to an exact Scarp location.</p>
      </div>
      <button type="button" aria-label="Close source notes" onClick={onClose}>Close</button>
    </div>
    <p className="project-replace-help">
      These notes exist only in this browser tab. They are not saved to localStorage,
      exported, sent to a server, included in share links, or inserted into Scarp source.
      A note becomes orphaned if its recorded file or position no longer exists.
    </p>
    <div className="source-note-summary" role="status" aria-label="Source notes summary">
      <span>{summary?.total ?? 0}/{MAX_SOURCE_NOTES} notes</span>
      <span>{summary?.unresolved ?? 0} unresolved</span>
      <span>{summary?.resolved ?? 0} resolved</span>
      <span>{summary?.orphaned ?? 0} orphaned</span>
      <span>{summary?.bodyBytes ?? 0} body bytes</span>
    </div>

    <form className="source-note-editor" onSubmit={event => { event.preventDefault(); save(); }}>
      <h3>{editingId === null ? 'Add source annotation' : 'Edit source annotation'}</h3>
      <div className="source-note-position">
        <label htmlFor="source-note-file">File</label>
        <select id="source-note-file" value={selectedFile}
          onChange={event => setFile(event.target.value)}>
          {files.map(path => <option key={path} value={path}>{path}</option>)}
        </select>
        <label htmlFor="source-note-line">Line</label>
        <input id="source-note-line" type="number" min="1" inputMode="numeric"
          value={line} onChange={event => setLine(event.target.value)}/>
        <label htmlFor="source-note-column">Column</label>
        <input id="source-note-column" type="number" min="1" inputMode="numeric"
          value={column} onChange={event => setColumn(event.target.value)}/>
      </div>
      <div className="source-note-inputs">
        <label htmlFor="source-note-category">Category</label>
        <select id="source-note-category" value={category}
          onChange={event => setCategory(event.target.value as SourceNoteCategory)}>
          {SOURCE_NOTE_CATEGORIES.map(value =>
            <option key={value} value={value}>{names[value]}</option>)}
        </select>
        <label htmlFor="source-note-title">Note title</label>
        <input id="source-note-title" type="text" maxLength={80}
          placeholder="What needs attention?" value={title}
          onChange={event => setTitle(event.target.value)}/>
        <label htmlFor="source-note-body">Private note text</label>
        <textarea id="source-note-body" rows={4} value={body}
          onChange={event => setBody(event.target.value)}
          placeholder="Explanation, question, or investigation…"/>
      </div>
      <div className="source-note-actions">
        <button type="submit" className="button-primary"
          disabled={editingId === null && notes.items.length >= MAX_SOURCE_NOTES}>
          {editingId === null ? 'Add source note' : 'Save note changes'}
        </button>
        {editingId !== null &&
          <button type="button" onClick={resetEditor}>Cancel editing</button>}
      </div>
    </form>

    <div className="source-note-filters">
      <label htmlFor="source-note-query">Search notes</label>
      <input id="source-note-query" type="search" maxLength={128}
        value={filter.query} placeholder="Title, note text, or file"
        onChange={event => changeFilter('query', event.target.value)}/>
      <label htmlFor="source-note-filter-category">Category</label>
      <select id="source-note-filter-category" value={filter.category}
        onChange={event => changeFilter('category',
          event.target.value as SourceNoteFilter['category'])}>
        <option value="all">All categories</option>
        {SOURCE_NOTE_CATEGORIES.map(value =>
          <option key={value} value={value}>{names[value]}</option>)}
      </select>
      <label htmlFor="source-note-filter-status">Status</label>
      <select id="source-note-filter-status" value={filter.status}
        onChange={event => changeFilter('status',
          event.target.value as SourceNoteFilter['status'])}>
        <option value="all">All notes</option>
        <option value="open">Open and located</option>
        <option value="resolved">Resolved</option>
        <option value="orphaned">Orphaned location</option>
      </select>
      <label htmlFor="source-note-filter-file">File</label>
      <select id="source-note-filter-file" value={filter.path}
        onChange={event => changeFilter('path', event.target.value)}>
        <option value="all">All files</option>
        {files.map(path => <option key={path} value={path}>{path}</option>)}
      </select>
    </div>

    {shown.length === 0 ? <p className="project-search-status" role="status">
      {notes.items.length ? 'No notes match the current filters.' : 'No source notes saved in this tab.'}
    </p> : <div className="source-note-list" aria-label="Saved source annotations">
      {shown.map(note => {
        const located = validSourceNotePoint(workspace, note.point);
        return <article key={note.id} className="source-note-item">
          <div className="source-note-head">
            <h3>{note.title}</h3>
            <span>{names[note.category]}</span>
            <span>{note.resolved ? 'Resolved' : 'Open'}</span>
            {!located && <strong>Orphaned location</strong>}
          </div>
          <p className="source-note-content">{note.body || '(empty note)'}</p>
          <div className="source-note-item-actions">
            <button type="button" disabled={!located} onClick={() => onNavigate(note.point)}
              aria-label={'Open source note ' + note.title}>
              {note.point.path}:{note.point.line}:{note.point.column}
            </button>
            <button type="button" aria-label={'Edit source note ' + note.title}
              onClick={() => edit(note)}>Edit</button>
            <button type="button"
              aria-label={(note.resolved ? 'Reopen' : 'Resolve') + ' source note ' + note.title}
              onClick={() => toggle(note)}>{note.resolved ? 'Reopen' : 'Resolve'}</button>
            <button type="button" aria-label={'Discard source note ' + note.title}
              onClick={() => discard(note)}>Discard</button>
          </div>
        </article>;
      })}
    </div>}
    <div className="source-note-footer">
      <button type="button" disabled={!notes.items.length} onClick={clear}>Clear all source notes</button>
      <span>Reloading the page discards all annotations.</span>
    </div>
    {message && <p role="status" className="project-search-status">{message}</p>}
  </section>;
}
