import { useState } from 'react';
import type { Workspace } from './workspace';

type Props = {
  workspace: Workspace;
  ignored: number;
  kind?: 'folder' | 'archive';
  onApply: (entry: string) => void;
  onCancel: () => void;
};

export function SourceFolderPreview({ workspace, ignored, kind = 'folder', onApply, onCancel }: Props) {
  const isArchive = kind === 'archive';
  const label = isArchive ? 'source ZIP' : 'source folder';
  const [entry, setEntry] = useState(workspace.entry);
  const paths = Object.keys(workspace.files).sort();
  const encoder = new TextEncoder();
  const size = Object.values(workspace.files).reduce((sum, source) => sum + encoder.encode(source).byteLength, 0);
  return (
    <section className="project-search source-folder-preview" aria-label={isArchive ? "Source ZIP preview" : "Source folder preview"}>
      <div className="project-search-bar source-folder-heading">
        <h2>Review {label}</h2>
        <button type="button" onClick={onCancel}>{isArchive ? 'Cancel ZIP import' : 'Cancel folder import'}</button>
      </div>
      <p className="project-search-status">
        {paths.length} .srp files · {size} UTF-8 bytes{!isArchive && ' · ' + ignored + ' non-source files ignored'}
      </p>
      <p className="project-replace-help">
        Relative paths are preserved. {isArchive ? 'Only canonical uncompressed Playground source exports are accepted.' : 'Only source text is imported; manifests and other files are ignored.'}
        The current project is unchanged until you confirm replacement. Nothing runs automatically.
      </p>
      <label className="source-folder-entry">
        Entrypoint
        <select value={entry} onChange={event => setEntry(event.target.value)}>
          {paths.map(path => <option key={path} value={path}>{path}</option>)}
        </select>
      </label>
      <ul className="source-folder-files">
        {paths.map(path => <li key={path}>
          <span>{path}</span>
          <span>{encoder.encode(workspace.files[path]).byteLength} B{path === entry ? ' · entry' : ''}</span>
        </li>)}
      </ul>
      <button type="button" className="button-primary" onClick={() => onApply(entry)}
        disabled={!Object.hasOwn(workspace.files, entry)}>Replace with {label}</button>
    </section>
  );
}
