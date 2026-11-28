import { useMemo, useState } from 'react';
import { analyzeModuleImpact, formatModuleImpactReport, type ModuleImpactReport } from './module-impact';
import type { Workspace } from './workspace';
import './module-impact.css';

type Props = {
  workspace: Workspace;
  activeFile: string;
  onNavigate: (path: string, line: number, column: number) => void;
  onClose: () => void;
};

type View = 'affected' | 'unaffected' | 'stages' | 'issues';

function downloadReport(report: ModuleImpactReport) {
  const text = formatModuleImpactReport(report);
  const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
  try {
    const link = document.createElement('a');
    link.href = url;
    link.download = 'scarp-module-impact.txt';
    link.rel = 'noopener';
    document.body.append(link);
    link.click();
    link.remove();
  } finally {
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}

/**
 * Present a bounded lexical dependency audit. A changed file is not edited,
 * executed, or sent outside the browser. This is distinct from compiler
 * evaluation and never claims that absent paths are necessarily unused.
 */
export function ModuleImpactPanel({ workspace, activeFile, onNavigate, onClose }: Props) {
  const [selected, setSelected] = useState(activeFile);
  const [view, setView] = useState<View>('affected');
  const [query, setQuery] = useState('');
  const files = useMemo(() => Object.keys(workspace.files).sort(), [workspace]);
  const effectivePath = Object.hasOwn(workspace.files, selected) ? selected : workspace.entry;
  const result = useMemo(() => analyzeModuleImpact(workspace, effectivePath), [workspace, effectivePath]);
  const report = result.ok ? result.report : null;
  const needle = query.trim().toLowerCase();
  const matching = (path: string) => path.toLowerCase().includes(needle);

  return <section id="module-impact-panel" className="project-search module-impact-panel"
    aria-label="Module change impact" data-testid="module-impact-panel">
    <div className="project-search-bar">
      <div className="impact-heading">
        <h2>Module change impact</h2>
        <p>Potential rebuild and retest scope from locally scanned import relationships.</p>
      </div>
      <button type="button" onClick={onClose} aria-label="Close module impact">Close</button>
    </div>

    <div className="impact-control-row">
      <label htmlFor="module-impact-target">Hypothetically changed module</label>
      <select id="module-impact-target" value={effectivePath}
        onChange={event => setSelected(event.target.value)}>
        {files.map(path => <option key={path} value={path}>{path}</option>)}
      </select>
      <label htmlFor="module-impact-filter">Filter filenames</label>
      <input id="module-impact-filter" value={query} type="search" maxLength={128}
        placeholder="Filter by path…" onChange={event => setQuery(event.target.value)}/>
    </div>

    {!result.ok ? <p role="alert">{result.error}</p> : <>
      <div className="impact-summary" role="status" aria-label="Impact analysis summary">
        <span>{report!.affected.length} possibly affected module(s)</span>
        <span>{report!.potentiallyUnaffected.length} outside found dependency paths</span>
        <span>{report!.components.filter(group => group.cyclic).length} cycle group(s)</span>
        <span>{report!.scannedImports} scanned imports</span>
      </div>
      {!report!.canCertifyUnaffected && <p className="impact-warning" role="status">
        This dependency audit is partial or has unresolved imports. Modules outside found
        dependency paths must NOT be treated as certainly unaffected.
      </p>}
      <p className="project-replace-help">
        Scarp compiler verification remains authoritative. Edits can affect behavior
        through mechanisms not reflected in static import edges; this panel is an advisory only.
      </p>

      <div className="impact-tabs" role="group" aria-label="Impact report sections">
        {(['affected', 'unaffected', 'stages', 'issues'] as const).map(section =>
          <button key={section} type="button" aria-pressed={view === section}
            onClick={() => setView(section)}>
            {section === 'affected' ? 'Affected' :
              section === 'unaffected' ? 'Other modules' :
              section === 'stages' ? 'Dependency stages' : 'Caveats'}
          </button>)}
      </div>

      {view === 'affected' && <div className="impact-list" aria-label="Potentially affected modules">
        {report!.affected.filter(item => matching(item.path)).map(item =>
          <article key={item.path} className="impact-item">
            <div className="impact-item-heading">
              <button type="button" onClick={() => onNavigate(item.path, 1, 1)}
                aria-label={'Open possibly affected module ' + item.path}>
                {item.path}
              </button>
              <span>{item.changed ? 'Changed source' :
                item.direct ? 'Direct importer' : item.distance + ' import hops'}</span>
              {item.isEntry && <strong>Entry</strong>}
            </div>
            <p>{item.changed ? 'Original selected source' :
              'Reason: ' + item.route.join(' → ')}</p>
          </article>)}
        {report!.affected.every(item => !matching(item.path)) &&
          <p className="project-search-status">No affected paths match the filter.</p>}
      </div>}

      {view === 'unaffected' && <div className="impact-list" aria-label="Modules outside dependency paths">
        <p className="project-search-status">{report!.canCertifyUnaffected
          ? 'No scanned dependency path leads from these modules to the selected source.'
          : 'Missing or unsupported imports can hide further paths. Treat this list as uncertain.'}</p>
        {report!.potentiallyUnaffected.filter(matching).map(path =>
          <div key={path} className="impact-other-module">
            <button type="button" onClick={() => onNavigate(path, 1, 1)}
              aria-label={'Open other module ' + path}>{path}</button>
          </div>)}
        {report!.potentiallyUnaffected.filter(matching).length === 0 &&
          <p className="project-search-status">No other modules match the current filter.</p>}
      </div>}

      {view === 'stages' && <div className="impact-list" aria-label="Local dependency stages">
        <p className="project-search-status">
          Lexical dependency ordering only. Cyclic groups cannot be split into guaranteed build steps.
        </p>
        {report!.buildOrder.map((id, index) => {
          const group = report!.components[id];
          return <article key={id} className="impact-stage">
            <h3>Stage {index + 1}{group.cyclic ? ' · cycle' : ''}</h3>
            <p>{group.dependencies.length} dependency group(s) ·
              {' '}{group.dependents.length} dependent group(s)</p>
            <ul>{group.members.map(path => <li key={path}>
              <button type="button" onClick={() => onNavigate(path, 1, 1)}>
                {path}</button></li>)}</ul>
          </article>;
        })}
      </div>}

      {view === 'issues' && <div className="impact-list" aria-label="Impact scan caveats">
        {report!.issues.length === 0
          ? <p className="project-search-status">No lexical scan caveats found for this workspace.</p>
          : <ul>{report!.issues.map(issue => <li key={issue}>{issue}</li>)}</ul>}
        {report!.missingImports.map((edge, i) => (
          <p key={'missing' + i}>Missing: {edge.importer}:{edge.line}:{edge.column}
            {' → '}{edge.specifier}</p>))}
        {report!.unsupportedImports.map((edge, i) => (
          <p key={'invalid' + i}>Unsupported import spelling: {edge.importer}:{edge.line}:{edge.column}
            {' → '}{edge.specifier}</p>))}
      </div>}

      <div className="impact-actions">
        <button type="button" onClick={() => downloadReport(report!)}>
          Download source-free impact report
        </button>
        <p>No source text is included, and the report is not a compiler error diagnosis.</p>
      </div>
    </>}
  </section>;
}
