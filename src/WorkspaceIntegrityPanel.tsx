import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import {
  MAX_INTEGRITY_MANIFEST_BYTES, buildWorkspaceIntegrityManifest,
  compareWorkspaceIntegrity, formatIntegrityComparison,
  parseWorkspaceIntegrityManifest, serializeWorkspaceIntegrityManifest,
  validateIntegrityManifest,
  type WorkspaceIntegrityManifest, type IntegrityComparison,
} from './workspace-integrity';
import type { Workspace } from './workspace';
import './workspace-integrity.css';

type Props = { workspace: Workspace; onClose: () => void };

function downloadManifest(value: WorkspaceIntegrityManifest) {
  const content = serializeWorkspaceIntegrityManifest(value);
  if (!content) return;
  const url = URL.createObjectURL(new Blob([content], { type: 'application/json;charset=utf-8' }));
  try {
    const link = document.createElement('a');
    link.href = url;
    link.download = 'scarp-source-integrity.json';
    link.rel = 'noopener';
    document.body.append(link);
    link.click();
    link.remove();
  } finally {
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}

export function WorkspaceIntegrityPanel({ workspace, onClose }: Props) {
  const [baseline, setBaseline] = useState<WorkspaceIntegrityManifest | null>(null);
  const [comparison, setComparison] = useState<IntegrityComparison | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const token = useRef(0);
  const currentWorkspace = useRef(workspace);
  currentWorkspace.current = workspace;

  useEffect(() => {
    // Old computations must never be applied to a newer source snapshot.
    token.current++;
    setComparison(null);
    setBusy(false);
  }, [workspace]);
  useEffect(() => () => { token.current++; }, []);

  async function generate() {
    const request = ++token.current;
    const snapshot = workspace;
    setBusy(true);
    setMessage(null);
    try {
      const result = await buildWorkspaceIntegrityManifest(snapshot);
      if (request !== token.current || currentWorkspace.current !== snapshot) return;
      if (!result.ok) { setMessage(result.error); return; }
      setBaseline(result.value);
      setComparison(null);
      setMessage('Captured a local SHA-256 manifest from the current source bytes.');
    } finally {
      if (request === token.current) setBusy(false);
    }
  }

  async function check() {
    if (!baseline) return;
    const request = ++token.current;
    const snapshot = workspace;
    setBusy(true);
    setMessage(null);
    try {
      const result = await compareWorkspaceIntegrity(snapshot, baseline);
      if (request !== token.current || currentWorkspace.current !== snapshot) return;
      if (!result.ok) { setMessage(result.error); return; }
      setComparison(result.value);
      setMessage(result.value.matches
        ? 'Exact source and entrypoint match against the selected manifest.'
        : 'Source or entrypoint changes detected against the selected manifest.');
    } finally {
      if (request === token.current) setBusy(false);
    }
  }

  async function importManifest(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';
    if (!file) return;
    const request = ++token.current;
    setBusy(true);
    setMessage(null);
    try {
      if (file.size > MAX_INTEGRITY_MANIFEST_BYTES) {
        if (request === token.current) setMessage('Manifest file exceeds the 32 KiB limit.');
        return;
      }
      const text = await file.text();
      if (request !== token.current) return;
      const decoded = parseWorkspaceIntegrityManifest(text);
      if (!decoded.ok) { setMessage(decoded.error); return; }
      const validated = await validateIntegrityManifest(decoded.value);
      if (request !== token.current) return;
      if (!validated.ok) { setMessage(validated.error); return; }
      setBaseline(validated.value);
      setComparison(null);
      setMessage('Loaded a source-free integrity manifest. Compare the current workspace to inspect changes.');
    } catch {
      if (request === token.current) setMessage('Unable to read or validate the selected manifest.');
    } finally {
      if (request === token.current) setBusy(false);
    }
  }

  function forget() {
    token.current++;
    setBaseline(null);
    setComparison(null);
    setBusy(false);
    setMessage('Manifest discarded from this tab.');
  }

  const visible = comparison?.files.filter(item => showAll || item.status !== 'same') ?? [];
  return <section id="workspace-integrity-panel" className="project-search integrity-panel"
    aria-label="Workspace source integrity" data-testid="workspace-integrity-panel">
    <div className="project-search-bar">
      <div className="integrity-heading">
        <h2>Workspace source integrity</h2>
        <p>Verify exact source bytes and the entrypoint against a local SHA-256 manifest.</p>
      </div>
      <button type="button" onClick={onClose} aria-label="Close source integrity">Close</button>
    </div>
    <p className="project-replace-help">
      SHA-256 identifies accidental changes to source bytes, including Unicode and line endings.
      A manifest is not a cryptographic signature: use a baseline received from a trusted source.
      Filenames, sizes and hashes can reveal information about a project even without its source text.
    </p>
    <div className="integrity-actions">
      <button type="button" className="button-primary" disabled={busy}
        onClick={() => void generate()}>
        Generate manifest from current workspace
      </button>
      <label htmlFor="integrity-manifest-input">Import manifest JSON</label>
      <input id="integrity-manifest-input" type="file" accept=".json,application/json"
        disabled={busy} onChange={event => void importManifest(event)}/>
      <button type="button" onClick={() => void check()}
        disabled={busy || !baseline}>Compare current sources</button>
      <button type="button" disabled={!baseline || busy}
        onClick={() => baseline && downloadManifest(baseline)}>Download manifest</button>
      <button type="button" disabled={!baseline} onClick={forget}>Discard manifest</button>
    </div>

    {busy && <p role="status" className="project-search-status">Calculating local SHA-256 fingerprints…</p>}
    {message && <p role="status" className="project-search-status">{message}</p>}

    {baseline ? <div className="integrity-baseline" aria-label="Selected source integrity manifest">
      <h3>Trusted baseline — selected locally</h3>
      <p>{baseline.files.length} source file(s) · entry {baseline.entry}</p>
      <p className="integrity-digest">
        <strong>Workspace SHA-256</strong>
        <code>{baseline.workspaceSha256}</code>
      </p>
      <small>Kept only in this browser tab. Export explicitly if you need to retain the fingerprint.</small>
    </div> :
      <p className="project-search-status">No integrity baseline selected. Generate or import one above.</p>}

    {comparison && <div className="integrity-results" aria-label="Source integrity comparison">
      <p role="status" className={'integrity-state ' + (comparison.matches ? 'integrity-match' : 'integrity-mismatch')}>
        {comparison.matches ? 'Exact match' : 'Differences found'}
      </p>
      <div className="integrity-totals" aria-label="Source file comparison summary">
        <span>{comparison.unchanged} matching</span>
        <span>{comparison.modified} modified</span>
        <span>{comparison.added} added</span>
        <span>{comparison.missing} missing</span>
      </div>
      {comparison.entryChanged && <p className="integrity-entry">
        Entrypoint changed: {comparison.expectedEntry} → {comparison.actualEntry}
      </p>}
      <div className="integrity-digest">
        <strong>Expected</strong><code>{comparison.expectedRoot}</code>
        <strong>Actual</strong><code>{comparison.actualRoot}</code>
      </div>
      <label className="integrity-toggle">
        <input type="checkbox" checked={showAll}
          onChange={event => setShowAll(event.target.checked)}/>
        Show unchanged source files
      </label>
      <div className="integrity-files" aria-label="Compared integrity files">
        {visible.length === 0
          ? <p className="project-search-status">No changed filenames to display.</p>
          : visible.map(file => <div key={file.path} className={'integrity-file status-' + file.status}>
            <strong>{file.path}</strong>
            <span>{file.status}</span>
            <small>{file.expectedBytes === null ? '—' : file.expectedBytes} →
              {' '}{file.actualBytes === null ? '—' : file.actualBytes} B</small>
          </div>)}
      </div>
      <details className="integrity-text-report">
        <summary>Source-free comparison details</summary>
        <pre>{formatIntegrityComparison(comparison)}</pre>
      </details>
    </div>}
  </section>;
}
