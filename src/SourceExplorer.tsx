import { useMemo, useState } from 'react';
import { buildSourceTree, folderContains, MAX_EXPLORER_FILTER, type SourceTreeNode } from './workspace-tree';
import { MAX_FILES, type Workspace } from './workspace';

type Props = {
  workspace: Workspace;
  activeFile: string;
  onOpen: (path: string) => void;
  onCreate: (path: string) => string | null;
  onClose: () => void;
};

type TreeProps = {
  nodes: SourceTreeNode[];
  activeFile: string;
  collapsed: ReadonlySet<string>;
  filtering: boolean;
  onToggle: (path: string) => void;
  onOpen: (path: string) => void;
  onNew: (folder: string) => void;
  allowCreate: boolean;
};

function TreeNodes({ nodes, activeFile, collapsed, filtering, onToggle, onOpen, onNew, allowCreate }: TreeProps) {
  return (
    <ul className="source-explorer-tree">
      {nodes.map(node => node.kind === 'file' ? (
        <li key={node.path}>
          <button type="button" className="source-explorer-file"
            aria-label={'Open source ' + node.path} aria-current={activeFile === node.path ? 'true' : undefined}
            onClick={() => onOpen(node.path)}>
            <span className="srp-icon" aria-hidden="true">S</span>
            <span className="source-explorer-name">{node.name}</span>
            {node.entry && <span className="entry-pill">entry</span>}
            <span className="source-explorer-size">{node.bytes} B</span>
          </button>
        </li>
      ) : (
        <li key={node.path}>
          <div className="source-explorer-folder-row">
            <button type="button" className="source-explorer-folder"
              aria-label={'Folder ' + node.path}
              aria-expanded={filtering || !collapsed.has(node.path)}
              onClick={() => onToggle(node.path)} disabled={filtering}>
              <span aria-hidden="true">{filtering || !collapsed.has(node.path) ? '▾' : '▸'}</span>
              <span className="source-explorer-name">{node.name}</span>
              {folderContains(node.path, activeFile) && <span className="source-explorer-active-folder">active</span>}
              <span className="source-explorer-size">{node.fileCount} files</span>
            </button>
            <button type="button" className="source-explorer-new"
              aria-label={'Create source in ' + node.path} disabled={!allowCreate}
              onClick={() => onNew(node.path)}>+</button>
          </div>
          {(filtering || !collapsed.has(node.path)) &&
            <TreeNodes nodes={node.children} activeFile={activeFile} collapsed={collapsed}
              filtering={filtering} onToggle={onToggle} onOpen={onOpen} onNew={onNew}
              allowCreate={allowCreate} />}
        </li>
      ))}
    </ul>
  );
}

export function SourceExplorer({ workspace, activeFile, onOpen, onCreate, onClose }: Props) {
  const [query, setQuery] = useState('');
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const [draft, setDraft] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const tree = useMemo(() => buildSourceTree(workspace, query), [workspace, query]);
  const filtering = query.trim().length > 0;
  const allowCreate = !tree.error && tree.total < MAX_FILES;

  function toggle(path: string) {
    setCollapsed(previous => {
      const next = new Set(previous);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }

  function beginCreate(path: string) {
    setDraft(path ? path + '/' : '');
    setProblem(null);
  }

  function create() {
    if (draft === null) return;
    const error = onCreate(draft);
    if (error) { setProblem(error); return; }
    setDraft(null);
    setProblem(null);
    setQuery('');
    setCollapsed(previous => new Set([...previous].filter(path => !folderContains(path, draft))));
  }

  return (
    <section id="source-explorer-panel" className="project-search source-explorer" aria-label="Source explorer">
      <div className="project-search-bar source-explorer-heading">
        <h2>Source explorer</h2>
        <button type="button" disabled={!allowCreate} onClick={() => beginCreate('')}>New source</button>
        <button type="button" onClick={onClose}>Close explorer</button>
      </div>
      <div className="project-search-bar source-explorer-filter">
        <label htmlFor="source-explorer-filter">Filter paths</label>
        <input id="source-explorer-filter" type="search" value={query} maxLength={MAX_EXPLORER_FILTER}
          onChange={event => setQuery(event.target.value)} placeholder="Filter .srp files and folders" />
        <button type="button" disabled={!query} onClick={() => setQuery('')}>Clear filter</button>
      </div>
      <p className="project-search-status" role="status">
        {tree.matched} of {tree.total} source files · {tree.totalBytes} UTF-8 bytes · {MAX_FILES - tree.total} file slots remaining
      </p>
      {tree.error && <p className="source-explorer-error">{tree.error}</p>}
      {draft !== null && <form className="project-search-bar source-explorer-create" onSubmit={event => {
        event.preventDefault();
        create();
      }}>
        <label htmlFor="source-explorer-new-path">New source path</label>
        <input id="source-explorer-new-path" type="text" value={draft} maxLength={128}
          autoComplete="off" spellCheck={false} onChange={event => { setDraft(event.target.value); setProblem(null); }} />
        <button type="submit" disabled={!draft || !allowCreate}>Create source file</button>
        <button type="button" onClick={() => { setDraft(null); setProblem(null); }}>Cancel new source</button>
      </form>}
      {problem && <p role="status" className="source-explorer-error">{problem}</p>}
      {tree.matched ? (
        <div className="source-explorer-scroll">
          <TreeNodes nodes={tree.nodes} activeFile={activeFile} collapsed={collapsed}
            filtering={filtering} onToggle={toggle} onOpen={onOpen} onNew={beginCreate}
            allowCreate={allowCreate} />
        </div>
      ) : !tree.error && <p className="project-search-status">No matching source paths.</p>}
    </section>
  );
}
