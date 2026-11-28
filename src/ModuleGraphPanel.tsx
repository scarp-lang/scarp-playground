import { useMemo } from 'react';
import { inspectModuleGraph, type ModuleImport } from './module-graph';
import type { Workspace } from './workspace';
import type { ProjectSearchHit } from './project-search';

type Props = {
  workspace: Workspace;
  activeFile: string;
  onNavigate: (hit: ProjectSearchHit) => void;
  onClose: () => void;
};

function edgeLabel(edge: ModuleImport): string {
  if (edge.status === 'invalid') return 'Unsupported path spelling';
  if (edge.status === 'missing') return 'Missing: ' + edge.target;
  return edge.target ?? '';
}

export function ModuleGraphPanel({ workspace, activeFile, onNavigate, onClose }: Props) {
  const graph = useMemo(() => inspectModuleGraph(workspace), [workspace]);
  const unresolved = graph.nodes.flatMap(node => node.outgoing).filter(edge => edge.status !== 'resolved');
  const reached = graph.nodes.filter(node => node.reached).length;
  const cycles = graph.nodes.filter(node => node.cycle).length;
  const navigateFile = (path: string) => onNavigate({ path, line: 1, column: 1, preview: '' });
  const navigateImport = (edge: ModuleImport) => onNavigate({
    path: edge.importer, line: edge.line, column: edge.column, preview: edge.specifier,
  });
  return (
    <section id="module-graph-panel" className="project-search module-graph" aria-label="Module dependencies">
      <div className="project-search-bar module-graph-heading">
        <h2>Module dependencies</h2>
        <button type="button" aria-label="Close module dependencies" onClick={onClose}>Close</button>
      </div>
      <p className="project-search-status">
        {graph.nodes.length} files · {graph.totalBytes} UTF-8 bytes · {graph.scannedImports} scanned imports
        {' · '}{reached} reached from entry · {unresolved.length} unresolved · {cycles} cycle members
      </p>
      <p className="project-replace-help">
        Local import overview, not compiler verification. Unreached files may still be useful.
        Verify code for authoritative diagnostics. Nothing is executed or modified here.
      </p>
      {!graph.complete && <p className="module-graph-warning" role="status">
        Partial scan: unvisited files cannot be classified reliably.
      </p>}
      {graph.issues.length > 0 && <ul className="module-graph-issues">
        {graph.issues.map(issue => <li key={issue}>{issue}</li>)}
      </ul>}
      <div className="module-graph-nodes">
        {graph.nodes.map(node => (
          <article className="module-graph-node" key={node.path} aria-label={'Dependencies for ' + node.path}>
            <div className="module-graph-node-heading">
              <button className="module-graph-path" type="button"
                aria-current={activeFile === node.path ? 'true' : undefined}
                onClick={() => navigateFile(node.path)}>{node.path}</button>
              <span>{node.bytes} B · {node.incoming.length} incoming · {node.outgoing.length} outgoing</span>
            </div>
            <div className="module-graph-tags">
              {node.path === graph.entry && <span>Entry</span>}
              {node.reached ? <span>Reached</span> : graph.complete ? <span>Not reached by scanned imports</span> : <span>Reachability unknown</span>}
              {node.cycle && <span className="module-graph-warning">Cycle</span>}
            </div>
            {node.outgoing.length > 0 ? (
              <ul className="module-graph-edges">
                {node.outgoing.map(edge => <li key={edge.line + ':' + edge.column}>
                  <button type="button" className="module-graph-import" onClick={() => navigateImport(edge)}
                    aria-label={'Go to import in ' + edge.importer + ':' + edge.line + ':' + edge.column}>
                    {edge.line}:{edge.column} · {edge.specifier || '(empty path)'}
                  </button>
                  {edge.status === 'resolved' && edge.target !== null
                    ? <button type="button" className="module-graph-target" onClick={() => navigateFile(edge.target!)}
                        aria-label={'Open imported module ' + edge.target}>{edgeLabel(edge)}</button>
                    : <span className="module-graph-warning">{edgeLabel(edge)}</span>}
                </li>)}
              </ul>
            ) : <p className="project-search-status">No imports shown.</p>}
          </article>
        ))}
      </div>
    </section>
  );
}
