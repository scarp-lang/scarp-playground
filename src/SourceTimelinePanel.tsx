import { useMemo, useState } from 'react';
import {
  MAX_TIMELINE_SNAPSHOTS, captureTimelineSnapshot, clearSourceTimeline,
  compareTimelineSnapshot, discardTimelineSnapshot, renameTimelineSnapshot,
  serializeTimelineManifest, timelineSummary, previewTimelineRestore,
  type SourceTimeline,
} from './source-timeline';
import { diffSource } from './source-diff';
import type { Workspace } from './workspace';
import './source-timeline.css';

type Props = {
  workspace: Workspace;
  activeFile: string;
  timeline: SourceTimeline;
  onChange: (next: SourceTimeline) => void;
  onRestore: (snapshot: Workspace, id: number) => void;
  onClose: () => void;
};

function downloadManifest(timeline: SourceTimeline) {
  const content = serializeTimelineManifest(timeline);
  if (!content) return;
  const url = URL.createObjectURL(new Blob([content], { type: 'application/json;charset=utf-8' }));
  try {
    const link = document.createElement('a');
    link.href = url;
    link.download = 'scarp-source-timeline-manifest.json';
    link.rel = 'noopener';
    document.body.append(link);
    link.click();
    link.remove();
  } finally {
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}

export function SourceTimelinePanel({
  workspace, activeFile, timeline, onChange, onRestore, onClose,
}: Props) {
  const [label, setLabel] = useState('');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [compareTarget, setCompareTarget] = useState<string>('current');
  const [fileChoice, setFileChoice] = useState('');
  const [renaming, setRenaming] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const summary = useMemo(() => timelineSummary(timeline), [timeline]);
  const selected = timeline.items.find(item => item.id === selectedId)
    ?? timeline.items.at(-1) ?? null;
  const other = compareTarget === 'current' ? 'current' : Number(compareTarget);
  const comparison = useMemo(() => selected
    ? compareTimelineSnapshot(timeline, selected.id, workspace, other) : null,
  [timeline, selected, workspace, other]);
  const compared = comparison?.ok ? comparison : null;
  const files = compared?.comparison.files.filter(file => file.status !== 'unchanged') ?? [];
  const targetFile = files.some(item => item.path === fileChoice)
    ? fileChoice : files[0]?.path ?? null;
  const diff = useMemo(() => {
    if (!compared || !targetFile) return null;
    const base = compared.base.checkpoint.workspace.files;
    const target = compared.target.workspace.files;
    return diffSource(
      Object.hasOwn(base, targetFile) ? base[targetFile] : null,
      Object.hasOwn(target, targetFile) ? target[targetFile] : null,
    );
  }, [compared, targetFile]);
  const restorable = selected ? previewTimelineRestore(timeline, selected.id, workspace, activeFile) : null;

  function capture() {
    const name = label.trim() || 'Snapshot ' + timeline.nextId;
    const result = captureTimelineSnapshot(timeline, workspace, activeFile, name);
    if (!result.ok) { setNotice(result.error); return; }
    onChange(result.timeline);
    setSelectedId(result.item!.id);
    setLabel('');
    setNotice('Captured a detached source-only snapshot in this tab.');
  }

  function rename() {
    if (!selected) return;
    const result = renameTimelineSnapshot(timeline, selected.id, nameDraft);
    if (!result.ok) { setNotice(result.error); return; }
    onChange(result.timeline);
    setRenaming(false);
    setNotice('Snapshot name updated.');
  }

  function discard() {
    if (!selected || !window.confirm('Discard selected source snapshot from this tab?')) return;
    const result = discardTimelineSnapshot(timeline, selected.id);
    if (!result.ok) { setNotice(result.error); return; }
    onChange(result.timeline);
    setSelectedId(null);
    setNotice('Snapshot discarded.');
  }

  function clear() {
    if (!timeline.items.length || !window.confirm('Discard all source snapshots in this tab?')) return;
    onChange(clearSourceTimeline(timeline));
    setSelectedId(null);
    setCompareTarget('current');
    setNotice('All session snapshots discarded.');
  }

  function restore() {
    if (!selected || !restorable ||
        !window.confirm('Restore all source files and the entrypoint from ' +
          selected.label + '? The current source can be restored using Undo bulk change until the next edit.')) return;
    onRestore(workspace, selected.id);
  }

  return <section id="source-timeline-panel" className="project-search source-timeline-panel"
    aria-label="Source snapshot timeline" data-testid="source-timeline-panel">
    <div className="project-search-bar">
      <div className="timeline-heading">
        <h2>Source snapshot timeline</h2>
        <p>Up to eight source-only snapshots, held in this tab's memory. Not a durable backup.</p>
      </div>
      <button type="button" onClick={onClose} aria-label="Close source timeline">Close</button>
    </div>
    <p className="project-replace-help">
      Capture explicit versions, inspect exact line differences, and restore a reviewed snapshot.
      Program input, console results and test reports are not saved in this timeline.
    </p>

    <div className="timeline-summary" aria-label="Timeline storage summary" role="status">
      <span>{summary?.count ?? 0}/{MAX_TIMELINE_SNAPSHOTS} snapshots</span>
      <span>{(summary?.bytes ?? 0).toLocaleString('en-US')} /
        {' '}{(summary?.capacity ?? 0).toLocaleString('en-US')} source bytes</span>
    </div>
    <div className="timeline-capture">
      <label htmlFor="timeline-snapshot-label">New snapshot name</label>
      <input id="timeline-snapshot-label" type="text" value={label}
        maxLength={80} placeholder={'Snapshot ' + timeline.nextId}
        onChange={event => setLabel(event.target.value)}/>
      <button type="button" className="button-primary"
        disabled={timeline.items.length >= MAX_TIMELINE_SNAPSHOTS}
        onClick={capture}>Capture current source</button>
    </div>

    {timeline.items.length === 0
      ? <p className="project-search-status" role="status">No source snapshots captured yet.</p>
      : <>
        <div className="timeline-selector">
          <label htmlFor="timeline-selected-snapshot">Snapshot to inspect</label>
          <select id="timeline-selected-snapshot" value={selected?.id ?? ''}
            onChange={event => {
              setSelectedId(Number(event.target.value));
              setFileChoice('');
              setRenaming(false);
            }}>
            {timeline.items.map(item => <option key={item.id} value={item.id}>
              {item.label} · #{item.id}
            </option>)}
          </select>
          <label htmlFor="timeline-compare-target">Compare with</label>
          <select id="timeline-compare-target" value={compareTarget}
            onChange={event => { setCompareTarget(event.target.value); setFileChoice(''); }}>
            <option value="current">Current workspace</option>
            {timeline.items.filter(item => item.id !== selected?.id)
              .map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
          </select>
        </div>
        {selected && <div className="timeline-selected-meta">
          <strong>{selected.label}</strong>
          <span>#{selected.id} · {selected.sourceBytes.toLocaleString('en-US')} source bytes ·
            entry {selected.checkpoint.workspace.entry}</span>
        </div>}
        <div className="timeline-actions">
          <button type="button" disabled={!restorable} onClick={restore}>Restore selected snapshot</button>
          <button type="button" disabled={!selected}
            onClick={() => {
              setNameDraft(selected?.label ?? '');
              setRenaming(true);
            }}>Rename snapshot</button>
          <button type="button" disabled={!selected} onClick={discard}>Discard selected</button>
          <button type="button" onClick={clear}>Discard all</button>
        </div>
        {renaming && selected && <div className="timeline-rename">
          <label htmlFor="timeline-rename-input">New name for {selected.label}</label>
          <input id="timeline-rename-input" value={nameDraft} maxLength={80}
            onChange={event => setNameDraft(event.target.value)}/>
          <button type="button" onClick={rename}>Save snapshot name</button>
          <button type="button" onClick={() => setRenaming(false)}>Cancel</button>
        </div>}

        {!comparison?.ok && comparison && <p role="alert">{comparison.error}</p>}
        {compared && <>
          <p className="project-search-status" role="status">
            {compared.comparison.changed} changed source file(s) ·
            {' '}{compared.comparison.files.length} compared filenames
          </p>
          {compared.comparison.entryBefore !== compared.comparison.entryAfter && (
            <p className="project-search-status">Entrypoint:
              {' '}{compared.comparison.entryBefore} → {compared.comparison.entryAfter}</p>
          )}
          <div className="timeline-files" aria-label="Compared source files">
            {compared.comparison.files.map(file => (
              <button type="button" key={file.path} disabled={file.status === 'unchanged'}
                aria-pressed={targetFile === file.path} onClick={() => setFileChoice(file.path)}>
                <strong>{file.path}</strong>
                <span>{file.status} · {file.beforeBytes} → {file.afterBytes} B</span>
              </button>
            ))}
          </div>
          {targetFile && diff && <div className="timeline-diff" aria-label={'Snapshot diff for ' + targetFile}>
            <h3>{targetFile}</h3>
            {diff.error ? <p role="alert">{diff.error}</p> :
              diff.rows.map((line, index) =>
                <div key={index} className={'timeline-diff-' + line.kind}>
                  <span>{line.before ?? '–'}/{line.after ?? '–'}</span>
                  <code>{line.text}{line.truncated ? '…' : ''}</code>
                  <small>{line.ending}</small>
                </div>)}
            {diff.approximate && <p>Bounded approximate diff for a large change.</p>}
            {diff.omitted > 0 && <p>{diff.omitted} line row(s) omitted.</p>}
          </div>}
        </>}
      </>}
    <div className="timeline-footer">
      <button type="button" disabled={timeline.items.length === 0}
        onClick={() => downloadManifest(timeline)}>Download source-free manifest</button>
      <p>The manifest includes names, paths and sizes, but no source code or stdin.</p>
    </div>
    {notice && <p className="project-search-status" role="status">{notice}</p>}
  </section>;
}
