import { useMemo, useState } from 'react';
import {
  inspectMissingImports, previewImportRepairs,
  MAX_IMPORT_REPAIR_CHOICES, type ImportRepairPlan, type ImportRepairSelection,
} from './import-repair';
import type { Workspace } from './workspace';
import './import-repair.css';

type Props = {
  workspace: Workspace;
  onApply: (snapshot: Workspace, plan: Extract<ImportRepairPlan, { ok: true }>) => void;
  onNavigate: (path: string, line: number, column: number) => void;
  onClose: () => void;
};

type Reviewed = { workspace: Workspace; plan: ImportRepairPlan };
const MAX_PREVIEW_CHARS = 300;

function boundedPreview(source: string): string {
  if (source.length <= MAX_PREVIEW_CHARS) return source;
  const cut = source.slice(0, MAX_PREVIEW_CHARS);
  const end = cut.charCodeAt(cut.length - 1);
  return (end >= 0xd800 && end <= 0xdbff ? cut.slice(0, -1) : cut) + '…';
}

export function ImportRepairPanel({ workspace, onApply, onNavigate, onClose }: Props) {
  const [targets, setTargets] = useState<Record<string, string>>({});
  const [review, setReview] = useState<Reviewed | null>(null);
  const [includeAllSuggestions, setIncludeAllSuggestions] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const inspection = useMemo(() => inspectMissingImports(workspace), [workspace]);
  const missing = inspection.ok ? inspection.missing : [];
  const paths = inspection.ok ? inspection.files : [];
  const chosen = missing.filter(item => targets[item.id] &&
    paths.includes(targets[item.id]));
  const current = review?.workspace === workspace ? review.plan : null;
  const plan = current?.ok ? current : null;

  function choose(id: string, path: string) {
    setTargets(current => ({ ...current, [id]: path }));
    setReview(null);
    setMessage(null);
  }

  function preview() {
    if (!inspection.ok) return;
    const selections: ImportRepairSelection[] = chosen.map(item => ({
      id: item.id, target: targets[item.id],
    }));
    const result = previewImportRepairs(workspace, selections);
    setReview({ workspace, plan: result });
    setMessage(result.ok ? 'Review all source text changes before applying.' : result.error);
  }

  function apply() {
    if (!plan || !review || review.workspace !== workspace) {
      setMessage('The import repair preview is stale. Inspect the current source again.');
      return;
    }
    if (!window.confirm(
      'Apply ' + plan.edits.length + ' explicitly selected local import repair(s) to ' +
      plan.changedFiles.length + ' source file(s)? ' +
      'This modifies source, not the compiled program state. Undo bulk change can reverse it.',
    )) return;
    onApply(workspace, plan);
    setReview(null);
    setTargets({});
  }

  function reset() {
    setTargets({});
    setReview(null);
    setMessage(null);
  }

  return <section id="import-repair-panel" className="project-search import-repair-panel"
    role="region" aria-label="Missing import repair" data-testid="import-repair-panel">
    <div className="project-search-bar">
      <div className="import-repair-heading">
        <h2>Repair missing local imports</h2>
        <p>Choose an existing Scarp file for each unresolved local import.</p>
      </div>
      <button type="button" aria-label="Close import repair" onClick={onClose}>Close</button>
    </div>
    <p className="project-replace-help">
      Suggested targets are ordered by filename similarity, but no suggestion
      is trusted or applied automatically. The Scarp compiler remains authoritative:
      a valid file path is not proof that its exported symbols are compatible.
    </p>
    {!inspection.ok ? <p role="alert">{inspection.error}</p> : <>
      <div className="import-repair-summary" role="status" aria-label="Import repair summary">
        <span>{missing.length} missing import(s)</span>
        <span>{chosen.length} selected repair(s)</span>
        <span>{inspection.invalid} unsupported import spelling(s)</span>
        <span>{paths.length} available .srp files</span>
      </div>
      {inspection.invalid > 0 && <p className="import-repair-warning" role="status">
        Some import spellings cannot be interpreted by the local lexical scanner.
        They require manual source review; this tool will not rewrite them.
      </p>}
      {missing.length === 0
        ? <p className="project-search-status">
            No missing import paths found by the bounded lexical scanner.
            This does not certify that the compiler will accept the project.
          </p>
        : <div className="import-repair-items" aria-label="Missing import locations">
          {missing.map(item => {
            const proposed = targets[item.id] ?? '';
            const options = includeAllSuggestions
              ? paths.filter(path => path !== item.importer) : item.suggestions;
            return <article key={item.id} className="import-repair-item">
              <div className="import-repair-location">
                <button type="button" aria-label={'Open missing import in ' +
                    item.importer + ' line ' + item.line + ' column ' + item.column}
                  onClick={() => onNavigate(item.importer, item.line, item.column)}>
                  {item.importer}:{item.line}:{item.column}
                </button>
                <span>Missing: <code>{item.attemptedPath}</code></span>
              </div>
              <p>Current literal: <code>{item.specifier}</code></p>
              <label htmlFor={'repair-' + item.id}>Target for missing import in
                {' '}{item.importer} line {item.line}</label>
              <select id={'repair-' + item.id} value={proposed}
                onChange={event => choose(item.id, event.target.value)}>
                <option value="">Leave this import unchanged</option>
                {proposed && !options.includes(proposed) &&
                  <option value={proposed}>{proposed}</option>}
                {options.map(path => <option key={path} value={path}>{path}</option>)}
              </select>
            </article>;
          })}
        </div>}
      <div className="import-repair-actions">
        <label>
          <input type="checkbox" checked={includeAllSuggestions}
            onChange={event => setIncludeAllSuggestions(event.target.checked)}/>
          Show every existing eligible file
        </label>
        <button type="button" onClick={reset}>Clear selections</button>
        <button type="button" className="button-primary" onClick={preview}
          disabled={!chosen.length || chosen.length > MAX_IMPORT_REPAIR_CHOICES}>
          Preview selected repairs
        </button>
      </div>
      {review && review.workspace !== workspace &&
        <p role="status" className="import-repair-warning">
          The workspace changed after the preview. Inspect and preview it again.
        </p>}
      {current && !current.ok && <p role="alert" className="import-repair-error">
        {current.error}
      </p>}
      {plan && <div className="import-repair-review" aria-label="Reviewed import repairs">
        <h3>Proposed import changes</h3>
        <p role="status">{plan.edits.length} import(s) across
          {' '}{plan.changedFiles.length} file(s), with
          {' '}{plan.remainingMissing} other missing import(s) left unchanged.</p>
        <div className="import-repair-diffs">
          {plan.lines.map(line => <article key={line.path + ':' + line.line}>
            <strong>{line.path}:{line.line} · {line.edits} import(s)</strong>
            <pre aria-label={'Before import repair in ' + line.path}>{boundedPreview(line.before)}</pre>
            <pre aria-label={'After import repair in ' + line.path}>{boundedPreview(line.after)}</pre>
          </article>)}
        </div>
        <h3>Verified file targets</h3>
        <ul className="import-repair-proofs">
          {plan.edits.map(edit => <li key={edit.id}>
            <code>{edit.importer}</code>{' → '}<code>{edit.target}</code>
            <small>Import string changes from {edit.oldSpecifier} to {edit.newSpecifier}</small>
          </li>)}
        </ul>
        <p className="project-replace-help">
          This preview has not changed your source. Apply only after inspecting
          all selected destinations and their expected exports.
        </p>
        <button type="button" className="button-primary" onClick={apply}>
          Apply reviewed import repairs
        </button>
      </div>}
      {message && <p className="project-search-status" role="status">{message}</p>}
    </>}
  </section>;
}
