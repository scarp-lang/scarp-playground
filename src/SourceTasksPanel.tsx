import { useEffect, useMemo, useState } from 'react';
import type { Workspace } from './workspace';
import {
  DEFAULT_SOURCE_TASK_FILTER, MAX_SOURCE_TASK_QUERY, SOURCE_TASK_TAGS,
  filterSourceTasks, scanSourceTasks, sourceTaskSummary,
  toggleSourceTaskReview, validatedSourceTaskReviews,
  type SourceTaskFilter, type SourceTaskPriority, type SourceTaskTag,
} from './source-tasks';
import './source-tasks.css';

type Props = {
  workspace: Workspace;
  onNavigate: (path: string, line: number, column: number) => void;
  onClose: () => void;
  reviewed: readonly string[];
  onReviewChange: (next: string[]) => void;
};

const priorities: { value: SourceTaskPriority; name: string }[] = [
  { value: 'urgent', name: 'Urgent (FIXME / XXX)' },
  { value: 'normal', name: 'Normal (TODO / HACK / OPTIMIZE)' },
  { value: 'informational', name: 'Informational (NOTE)' },
];

export function SourceTasksPanel({ workspace, onNavigate, onClose, reviewed, onReviewChange }: Props) {
  const [filter, setFilter] = useState<SourceTaskFilter>(DEFAULT_SOURCE_TASK_FILTER);
  const [groupByFile, setGroupByFile] = useState(false);
  const [showHelp, setShowHelp] = useState(false);

  const scan = useMemo(() => scanSourceTasks(workspace), [workspace]);
  const knownReviewIds = useMemo(() => validatedSourceTaskReviews(scan, reviewed), [scan, reviewed]);

  useEffect(() => {
    if (knownReviewIds.length !== reviewed.length ||
        knownReviewIds.some((id, index) => id !== reviewed[index])) {
      onReviewChange(knownReviewIds);
    }
  }, [knownReviewIds, reviewed, onReviewChange]);

  const paths = useMemo(() => Object.keys(workspace.files).sort(), [workspace]);
  const effectivePath = filter.path === 'all' || paths.includes(filter.path) ? filter.path : 'all';
  const visible = useMemo(() => filterSourceTasks(scan, {
    ...filter, path: effectivePath,
  }, knownReviewIds), [scan, filter, knownReviewIds, effectivePath]);
  const stats = useMemo(() => sourceTaskSummary(scan, knownReviewIds), [scan, knownReviewIds]);
  const grouped = useMemo(() => {
    if (!groupByFile) return [{ path: '', tasks: visible }];
    const unique = [...new Set(visible.map(task => task.path))];
    return unique.map(path => ({
      path,
      tasks: visible.filter(task => task.path === path),
    }));
  }, [groupByFile, visible]);

  const changeFilter = <K extends keyof SourceTaskFilter>(
    key: K, value: SourceTaskFilter[K],
  ) => setFilter(current => ({ ...current, [key]: value }));

  return (
    <section className="project-search source-tasks-panel"
      id="source-tasks-panel" role="region" aria-label="Source task explorer"
      data-testid="source-tasks-panel">
      <div className="project-search-bar">
        <div className="source-task-intro">
          <h2>Source tasks</h2>
          <p>Review TODO, FIXME and other tagged comments across local Scarp files.</p>
        </div>
        <button type="button" onClick={onClose} aria-label="Close source tasks">Close</button>
      </div>
      <p className="project-replace-help">
        Scans line comments only, skipping strings. This is not a compiler
        diagnostic. Review checkboxes are temporary and never modify source
        files, URLs, or browser storage.
      </p>

      {!scan.ok ? <p role="alert">{scan.error}</p> : <>
        <div className="source-task-summary" role="status" aria-label="Source task summary">
          <span>{stats!.total} tagged comments</span>
          <span>{stats!.urgent} urgent</span>
          <span>{stats!.pending} pending</span>
          <span>{stats!.reviewed} reviewed</span>
          {stats!.truncated && <strong>Limited to first 160 results</strong>}
        </div>

        <div className="source-task-controls" aria-label="Source task filters">
          <label htmlFor="source-task-text">Find task</label>
          <input id="source-task-text" type="search" maxLength={MAX_SOURCE_TASK_QUERY}
            value={filter.query} placeholder="Search comment text or file name"
            onChange={event => changeFilter('query', event.target.value)}/>
          <label htmlFor="source-task-tag">Tag</label>
          <select id="source-task-tag" value={filter.tag}
            onChange={event => changeFilter('tag', event.target.value as SourceTaskTag | 'all')}>
            <option value="all">All comment tags</option>
            {SOURCE_TASK_TAGS.map(tag => <option key={tag} value={tag}>{tag}</option>)}
          </select>
          <label htmlFor="source-task-priority">Priority</label>
          <select id="source-task-priority" value={filter.priority}
            onChange={event => changeFilter('priority',
              event.target.value as SourceTaskPriority | 'all')}>
            <option value="all">All priorities</option>
            {priorities.map(item =>
              <option key={item.value} value={item.value}>{item.name}</option>)}
          </select>
          <label htmlFor="source-task-file">Source file</label>
          <select id="source-task-file" value={effectivePath}
            onChange={event => changeFilter('path', event.target.value)}>
            <option value="all">All .srp files</option>
            {paths.map(path => <option key={path} value={path}>{path}</option>)}
          </select>
          <label htmlFor="source-task-review">Review status</label>
          <select id="source-task-review" value={filter.review}
            onChange={event => changeFilter('review',
              event.target.value as SourceTaskFilter['review'])}>
            <option value="all">All review states</option>
            <option value="pending">Not reviewed</option>
            <option value="reviewed">Reviewed in this tab</option>
          </select>
        </div>

        <div className="source-task-options">
          <label>
            <input type="checkbox" checked={groupByFile}
              onChange={event => setGroupByFile(event.target.checked)}/>
            Group results by file
          </label>
          <button type="button" aria-expanded={showHelp} aria-controls="source-tasks-help"
            onClick={() => setShowHelp(open => !open)}>
            {showHelp ? 'Hide help' : 'Show help'}
          </button>
          <button type="button" disabled={knownReviewIds.length === 0}
            onClick={() => onReviewChange([])}>Clear review flags</button>
        </div>
        {showHelp && <div id="source-tasks-help" className="source-task-help">
          <p>Recognized tags: TODO, FIXME, HACK, XXX, OPTIMIZE and NOTE.
            Place a tag at the start of a line comment, for example
            <code> // TODO: explain this function</code>.</p>
          <p>FIXME and XXX are urgent; TODO, HACK and OPTIMIZE are normal;
            NOTE is informational. Labels are conventions, not compiler guarantees.</p>
          <p>Click a source location to jump into Monaco. A review flag
            only acknowledges the current comment text in this browser tab.
            Editing or deleting the comment invalidates the old flag.</p>
        </div>}

        <p className="project-search-status" role="status">
          {visible.length} matching task(s) among {scan.tasks.length} scanned tasks.
        </p>
        {visible.length === 0 ? (
          <p className="project-search-status">No source comments match the filters.</p>
        ) : (
          <div className="source-task-results" aria-label="Tagged source tasks">
            {grouped.map(group => <div key={group.path || 'all'}>
              {groupByFile && <h3>{group.path} · {group.tasks.length}</h3>}
              <ol>
                {group.tasks.map(task => {
                  const isReviewed = knownReviewIds.includes(task.id);
                  return <li key={task.id} className={'source-task-item' +
                    (isReviewed ? ' source-task-reviewed' : '')}>
                    <div className="source-task-head">
                      <button type="button"
                        aria-label={'Open ' + task.tag + ' in ' + task.path +
                          ' line ' + task.line + ' column ' + task.column}
                        onClick={() => onNavigate(task.path, task.line, task.column)}>
                        {task.path}:{task.line}:{task.column}
                      </button>
                      <span className={'source-task-tag priority-' + task.priority}>
                        {task.tag}
                      </span>
                      <label>
                        <input type="checkbox" checked={isReviewed}
                          onChange={() => onReviewChange(
                            toggleSourceTaskReview(scan, reviewed, task.id))}/>
                        Reviewed
                      </label>
                    </div>
                    <p>{task.summary}{task.previewTruncated ? ' [preview shortened]' : ''}</p>
                  </li>;
                })}
              </ol>
            </div>)}
          </div>
        )}
      </>}
    </section>
  );
}
