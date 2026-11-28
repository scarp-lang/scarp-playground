import { useEffect, useMemo, useState } from 'react';
import type { Workspace } from './workspace';
import {
  MAX_SELECTIVE_FIND_BYTES, MAX_SELECTIVE_REPLACE_BYTES,
  previewSelectiveReplacement, scanSelectiveReplacement,
  type SelectivePlan, type SelectiveSearch,
} from './selective-replace';
import './selective-replace.css';

type Props = {
  workspace: Workspace;
  onApply: (snapshot: Workspace, options: SelectiveSearch,
    plan: Extract<SelectivePlan, { ok: true }>) => void;
  onNavigate: (path: string, line: number, column: number) => void;
  onClose: () => void;
};

type Reviewed = {
  workspace: Workspace;
  search: SelectiveSearch;
  plan: SelectivePlan;
};

export function SelectiveReplacePanel({ workspace, onApply, onNavigate, onClose }: Props) {
  const [query, setQuery] = useState('');
  const [replacement, setReplacement] = useState('');
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [wholeWord, setWholeWord] = useState(false);
  const [path, setPath] = useState('all');
  const [selected, setSelected] = useState<string[]>([]);
  const [review, setReview] = useState<Reviewed | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [groupByFile, setGroupByFile] = useState(true);

  const paths = useMemo(() => Object.keys(workspace.files).sort(), [workspace]);
  const effectivePath = path === 'all' || paths.includes(path) ? path : 'all';
  const options: SelectiveSearch = useMemo(() => ({
    query, replacement, caseSensitive, wholeWord, path: effectivePath,
  }), [query, replacement, caseSensitive, wholeWord, effectivePath]);
  const scan = useMemo(() => query.length >= 2
    ? scanSelectiveReplacement(workspace, options) : null, [workspace, options]);

  useEffect(() => { setSelected([]); setReview(null); setMessage(null); }, [scan]);
  const current = review?.workspace === workspace ? review.plan : null;
  const plan = current?.ok ? current : null;
  const items = scan?.ok ? scan.sites : [];
  const chosen = new Set(selected.filter(id => items.some(site => site.id === id)));
  const groups = useMemo(() => {
    if (!groupByFile) return [{ path: '', sites: items }];
    return [...new Set(items.map(item => item.path))].map(name => ({
      path: name, sites: items.filter(item => item.path === name),
    }));
  }, [items, groupByFile]);
  const validScan = scan?.ok && !scan.truncated;

  function toggle(id: string, checked: boolean) {
    setSelected(previous => checked
      ? [...new Set([...previous, id])]
      : previous.filter(value => value !== id));
    setReview(null);
  }

  function preview() {
    const ids = [...chosen];
    const candidate = previewSelectiveReplacement(workspace, options, ids);
    setReview({ workspace, search: options, plan: candidate });
    setMessage(candidate.ok ? 'Review every changed line before applying.' : candidate.error);
  }

  function apply() {
    if (!plan || !review || review.workspace !== workspace) {
      setMessage('The source changed after this preview. Preview again.');
      return;
    }
    const approved = window.confirm(
      'Replace ' + plan.replacementCount + ' selected occurrence(s) across ' +
      plan.changedFiles.length + ' Scarp source file(s)? ' +
      'This is literal replacement, not compiler-backed renaming. ' +
      'Undo bulk change can restore the original files.',
    );
    if (!approved) return;
    onApply(review.workspace, review.search, plan);
  }

  return <section className="project-search selective-replace"
    id="selective-replace-panel" role="region" aria-label="Selective replace"
    data-testid="selective-replace-panel">
    <div className="project-search-bar">
      <div>
        <h2>Selective project replacement</h2>
        <p>Choose exactly which literal matches to change in local .srp files.</p>
      </div>
      <button type="button" aria-label="Close selective replace" onClick={onClose}>Close</button>
    </div>
    <p className="project-replace-help">
      This changes text, including strings or comments when selected; it does
      not resolve symbols. The Rust compiler is the authority for validity.
      No source files are altered until you explicitly review and apply.
    </p>
    <div className="selective-replace-form">
      <label htmlFor="selective-query">Find text</label>
      <input id="selective-query" type="search" value={query}
        maxLength={MAX_SELECTIVE_FIND_BYTES} autoComplete="off"
        placeholder="Literal phrase (at least 2 characters)"
        onChange={event => setQuery(event.target.value)}/>
      <label htmlFor="selective-replacement">Replace with</label>
      <input id="selective-replacement" type="text" value={replacement}
        maxLength={MAX_SELECTIVE_REPLACE_BYTES} autoComplete="off"
        placeholder="Leave empty to delete selected text"
        onChange={event => setReplacement(event.target.value)}/>
      <div className="selective-replace-controls">
        <label>
          <input type="checkbox" checked={caseSensitive}
            onChange={event => setCaseSensitive(event.target.checked)}/> Match case
        </label>
        <label>
          <input type="checkbox" checked={wholeWord}
            onChange={event => setWholeWord(event.target.checked)}/> Whole words
        </label>
        <label htmlFor="selective-file">Search scope</label>
        <select id="selective-file" value={effectivePath}
          onChange={event => setPath(event.target.value)}>
          <option value="all">All Scarp files</option>
          {paths.map(item => <option key={item} value={item}>{item}</option>)}
        </select>
      </div>
    </div>
    {scan && !scan.ok && <p role="alert">{scan.error}</p>}
    {scan?.ok && <>
      <div className="selective-replace-summary" role="status" aria-label="Selective replace summary">
        <span>{scan.sites.length} matching occurrence(s)</span>
        <span>{selected.length} selected</span>
        <span>{scan.scannedFiles} file(s)</span>
        {scan.truncated && <strong>
          More than 160 occurrences. Narrow the source or query before replacing.
        </strong>}
      </div>
      <div className="selective-replace-options">
        <label>
          <input type="checkbox" checked={groupByFile}
            onChange={event => setGroupByFile(event.target.checked)}/> Group by file
        </label>
        <button type="button" onClick={() => setSelected(scan.sites.map(item => item.id))}
          disabled={!validScan || !items.length}>Select all matches</button>
        <button type="button" onClick={() => { setSelected([]); setReview(null); }}
          disabled={!selected.length}>Clear selection</button>
      </div>
      {items.length === 0
        ? <p className="project-search-status">No literal matches in the selected source scope.</p>
        : <div className="selective-replace-results" aria-label="Selectable source matches">
          {groups.map(group => <div key={group.path || 'all'}>
            {groupByFile && <h3>{group.path} · {group.sites.length} match(es)</h3>}
            <ol>{group.sites.map(site => <li key={site.id}>
              <label>
                <input type="checkbox" checked={chosen.has(site.id)}
                  disabled={scan.truncated}
                  aria-label={'Replace match in ' + site.path + ' line ' + site.line +
                    ' column ' + site.column}
                  onChange={event => toggle(site.id, event.target.checked)}/>
                Select
              </label>
              <button type="button" onClick={() => onNavigate(site.path, site.line, site.column)}
                aria-label={'Open source in ' + site.path + ' line ' + site.line +
                  ' column ' + site.column}>
                {site.path}:{site.line}:{site.column}
              </button>
              <span>Matched: <code>{site.matchedText}</code></span>
              <pre>{site.lineText.length <= 160 ? site.lineText :
                site.lineText.slice(0, 158) + '…'}</pre>
            </li>)}</ol>
          </div>)}
        </div>}
      <button type="button" className="button-primary" disabled={!validScan || !chosen.size}
        onClick={preview}>Preview {chosen.size} selected replacement(s)</button>
    </>}
    {review && review.workspace !== workspace &&
      <p role="status">The workspace changed after preview. Review again.</p>}
    {current && !current.ok && <p role="alert">{current.error}</p>}
    {plan && <section className="selective-replace-review" aria-label="Selective replacement preview">
      <h3>Exact changes to source</h3>
      <p>{plan.replacementCount} replacements across {plan.changedFiles.length} file(s);
        {' '}{plan.leftUnchanged} matching occurrence(s) left untouched.</p>
      <ol>{plan.lines.map(line => <li key={line.path + ':' + line.line}>
        <strong>{line.path}:{line.line} · {line.replacements} edit(s)</strong>
        <pre aria-label={'Original source line ' + line.path + ':' + line.line}>{line.before}</pre>
        <pre aria-label={'Replaced source line ' + line.path + ':' + line.line}>{line.after}</pre>
        {line.excerptTruncated && <small>Preview excerpt shortened.</small>}
      </li>)}</ol>
      <button type="button" className="button-primary" onClick={apply}>
        Apply reviewed selective replacements
      </button>
    </section>}
    {message && <p className="project-search-status" role="status">{message}</p>}
  </section>;
}
