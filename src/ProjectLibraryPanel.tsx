import { useEffect, useRef, useState } from 'react';
import { captureLibraryProject, libraryNameKey, MAX_LIBRARY_NAME, MAX_LIBRARY_PROJECTS, MAX_LIBRARY_SOURCE_BYTES,
  projectBytes, projectMatchesEditor, validLibraryName, type LibraryMutation, type LibraryProject } from './library/model';
import { changeProjectLibrary, clearProjectLibrary, readProjectLibrary, type LibrarySnapshot } from './library/store';
import type { Workspace } from './workspace';
import { LibraryBackupControls } from './LibraryBackupControls';

type Props = {
  workspace: Workspace;
  activeFile: string;
  onOpen: (project: LibraryProject) => boolean;
  onClose: () => void;
};

export function ProjectLibraryPanel({ workspace, activeFile, onOpen, onClose }: Props) {
  const [snapshot, setSnapshot] = useState<LibrarySnapshot | null>(null);
  const [busy, setBusy] = useState(true);
  const [notice, setNotice] = useState('');
  const [name, setName] = useState('');
  const [selected, setSelected] = useState('');
  const [rename, setRename] = useState('');
  const lifecycle = useRef(0);
  const pending = useRef(false);

  useEffect(() => {
    const token = ++lifecycle.current;
    async function load() {
      pending.current = true;
      try {
        const result = await readProjectLibrary(window.indexedDB);
        if (token !== lifecycle.current) return;
        if (result.ok) setSnapshot(result.value);
        else setNotice(result.error);
      } catch {
        if (token === lifecycle.current) setNotice('Browser project storage is unavailable.');
      } finally {
        if (token === lifecycle.current) { pending.current = false; setBusy(false); }
      }
    }
    void load();
    return () => { lifecycle.current++; pending.current = false; };
  }, []);

  const projects = snapshot?.library.projects ?? [];
  const total = projects.reduce((sum, project) => sum + projectBytes(project.workspace), 0);
  const chosen = projects.find(project => project.name === selected);
  const duplicate = projects.some(project => libraryNameKey(project.name) === libraryNameKey(name.trim()));

  async function refresh() {
    if (pending.current) return;
    const token = lifecycle.current;
    pending.current = true;
    setBusy(true);
    try {
      const result = await readProjectLibrary(window.indexedDB);
      if (token !== lifecycle.current) return;
      if (result.ok) {
        setSnapshot(result.value);
        setNotice('Refreshed saved projects.');
        setSelected('');
        setRename('');
      } else { setSnapshot(null); setNotice(result.error); }
    } catch {
      if (token === lifecycle.current) setNotice('Unable to refresh the local project library.');
    } finally {
      if (token === lifecycle.current) { pending.current = false; setBusy(false); }
    }
  }

  async function update(mutation: LibraryMutation, success: string, nextSelection = '') {
    if (!snapshot || pending.current) return;
    const token = lifecycle.current;
    pending.current = true;
    setBusy(true);
    try {
      const result = await changeProjectLibrary(window.indexedDB, snapshot, mutation);
      if (token !== lifecycle.current) return;
      if (result.ok) {
        setSnapshot(result.value);
        setSelected(nextSelection);
        setRename(nextSelection);
        if (mutation.kind === 'add') setName('');
        setNotice(success);
      } else setNotice(result.error);
    } catch {
      if (token === lifecycle.current) setNotice('Unable to update browser project storage.');
    } finally {
      if (token === lifecycle.current) { pending.current = false; setBusy(false); }
    }
  }

  function capture(projectName: string, replace = false) {
    const captured = captureLibraryProject(projectName, workspace, activeFile, Date.now());
    if (!captured.ok) { setNotice(captured.error); return; }
    if (replace && !window.confirm('Replace saved source snapshot "' + projectName + '" with the current editor sources? This cannot be undone.')) return;
    void update(replace ? { kind: 'replace', name: projectName, project: captured.value } :
      { kind: 'add', project: captured.value }, 'Saved source snapshot "' + projectName + '".', projectName);
  }

  async function clear() {
    if (!snapshot || pending.current || !window.confirm('Delete every named source snapshot in this browser? The open editor and separate autosaved copy will stay unchanged.')) return;
    const token = lifecycle.current;
    pending.current = true;
    setBusy(true);
    try {
      const result = await clearProjectLibrary(window.indexedDB, snapshot);
      if (token !== lifecycle.current) return;
      if (result.ok) {
        setSnapshot(result.value); setSelected(''); setRename('');
        setNotice('Deleted all named source snapshots.');
      } else setNotice(result.error);
    } catch {
      if (token === lifecycle.current) setNotice('Unable to clear browser project storage.');
    } finally {
      if (token === lifecycle.current) { pending.current = false; setBusy(false); }
    }
  }

  return <section id="project-library-panel" className="project-search project-library" aria-label="Local project library">
    <div className="project-search-bar library-heading">
      <h2>Local project library</h2>
      <button type="button" disabled={busy} onClick={() => void refresh()}>Refresh library</button>
      <button type="button" disabled={busy} onClick={onClose}>Close library</button>
    </div>
    <p className="project-replace-help">
      Save named source snapshots on this device. They are separate from the ordinary autosaved workspace,
      never update automatically, and contain no program input or execution results. Browser storage is
      unencrypted and can be cleared by the browser. Export project JSON for a durable backup.
    </p>
    {busy && <p role="status">Accessing local project storage…</p>}
    {notice && <p className="project-search-status" role="status">{notice}</p>}
    {snapshot && <>
      <p className="project-search-status">{projects.length} / {MAX_LIBRARY_PROJECTS} snapshots · {total} / {MAX_LIBRARY_SOURCE_BYTES} source bytes</p>
      <div className="library-form">
        <label>New snapshot name
          <input value={name} maxLength={MAX_LIBRARY_NAME} onChange={event => setName(event.target.value)} disabled={busy} />
        </label>
        <button type="button" className="button-primary" disabled={busy || !validLibraryName(name.trim()) || duplicate || projects.length >= MAX_LIBRARY_PROJECTS}
          onClick={() => capture(name.trim())}>Save named snapshot</button>
      </div>
      {duplicate && <p className="project-search-status">A snapshot with this name already exists. Select it to replace it explicitly.</p>}
      <ul className="library-list">
        {projects.map(project => <li key={project.name}>
          <button type="button" aria-pressed={selected === project.name} disabled={busy}
            onClick={() => { setSelected(project.name); setRename(project.name); }}>
            <strong>{project.name}</strong>
            <span>{Object.keys(project.workspace.files).length} files · {projectBytes(project.workspace)} B · {new Date(project.modified).toLocaleString()}</span>
          </button>
        </li>)}
      </ul>
      {chosen && <section className="library-preview" aria-label="Saved snapshot preview">
        <h3>{chosen.name}</h3>
        <p className="project-search-status">Entry: {chosen.workspace.entry} · Active: {chosen.activeFile}</p>
        <ul>{Object.keys(chosen.workspace.files).map(path => <li key={path}>{path}</li>)}</ul>
        {projectMatchesEditor(chosen, workspace, activeFile) && <p className="project-search-status">This source snapshot matches the open editor.</p>}
        <div className="library-actions">
          <button type="button" className="button-primary" disabled={busy}
            onClick={() => { if (onOpen(chosen)) setNotice('Opened saved source snapshot "' + chosen.name + '".'); }}>Open saved snapshot</button>
          <button type="button" disabled={busy} onClick={() => capture(chosen.name, true)}>Replace with current source</button>
          <button type="button" disabled={busy} onClick={() => {
            if (window.confirm('Delete saved source snapshot "' + chosen.name + '"? The open editor will not change.'))
              void update({ kind: 'delete', name: chosen.name }, 'Deleted the named source snapshot.');
          }}>Delete snapshot</button>
        </div>
        <div className="library-form">
          <label>Rename snapshot
            <input value={rename} maxLength={MAX_LIBRARY_NAME} disabled={busy} onChange={event => setRename(event.target.value)} />
          </label>
          <button type="button" disabled={busy || !validLibraryName(rename.trim()) || rename.trim() === chosen.name ||
            projects.some(item => item.name !== chosen.name && libraryNameKey(item.name) === libraryNameKey(rename.trim()))}
            onClick={() => void update({ kind: 'rename', name: chosen.name, nextName: rename.trim(), modified: Date.now() },
              'Renamed the saved source snapshot.', rename.trim())}>Rename saved snapshot</button>
        </div>
      </section>}
      <LibraryBackupControls snapshot={snapshot} busy={busy}
        onBusy={value => { pending.current = value; setBusy(value); }}
        onRestore={value => { setSnapshot(value); setSelected(''); setRename(''); }} />
      {projects.length > 0 && <button type="button" disabled={busy} onClick={() => void clear()}>Delete all named snapshots</button>}
    </>}
  </section>;
}
