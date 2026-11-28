import { LearningProgressPanel } from './LearningProgressPanel';
import { OutputDifferenceView } from './OutputDifferenceView';
import { TestReportControls } from './TestReportControls';
import { useMemo, useState } from 'react';
import { challenges, filterChallenges, levels, tracks, type Challenge } from './challenges/model';
import type { SuiteReport } from './runner/test-cases';

type Props = {
  active: Challenge | null;
  busy: boolean;
  running: boolean;
  progress: number;
  report: SuiteReport | null;
  onLoad: (challenge: Challenge) => void;
  onRun: () => void;
  onStop: () => void;
  onClose: () => void;
};

function ChallengeOutput({ label, value }: { label: string; value: string }) {
  return <div className="challenge-output">
    <span>{label}</span>
    <pre>{value === '' ? '(empty)' : JSON.stringify(value)}</pre>
  </div>;
}

export function ChallengePanel({ active, busy, running, progress, report,
  onLoad, onRun, onStop, onClose }: Props) {
  const [query, setQuery] = useState('');
  const [track, setTrack] = useState('');
  const [level, setLevel] = useState('');
  const [selected, setSelected] = useState(active?.id ?? challenges[0].id);
  const filtered = useMemo(() => filterChallenges(challenges, query, track, level), [query, track, level]);
  const challenge = filtered.find(item => item.id === selected) ?? filtered[0];
  const loaded = challenge?.id === active?.id;
  const visibleReport = loaded ? report : null;
  const passed = visibleReport?.results.filter(result => result.status === 'passed').length ?? 0;
  return <section id="challenge-panel" className="project-search challenge-panel" aria-label="Learning challenges">
    <div className="project-search-bar test-case-heading">
      <h2>Learning challenges</h2>
      <button type="button" onClick={onClose}>Close challenges</button>
    </div>
    <p className="project-replace-help">Practice with the pinned Scarp compiler. Every exercise has public cases,
      a starter workspace, hints and a reference solution. Passing these examples is not proof of correctness for all inputs.</p>
    <div className="challenge-filters">
      <label>Search challenges<input value={query} maxLength={100} onChange={event => setQuery(event.target.value)} /></label>
      <label>Topic<select value={track} onChange={event => setTrack(event.target.value)}>
        <option value="">All topics</option>{tracks.map(item => <option key={item}>{item}</option>)}
      </select></label>
      <label>Difficulty<select value={level} onChange={event => setLevel(event.target.value)}>
        <option value="">All levels</option>{levels.map(item => <option key={item}>{item}</option>)}
      </select></label>
    </div>
    <p role="status">{filtered.length} of {challenges.length} challenges</p>
    {active && <p className="challenge-active">Active challenge: {active.title}. Tests run against the current workspace.</p>}
    {filtered.length === 0 ? <p>No matching challenges.</p> : <>
      <label className="challenge-selection">Choose challenge<select value={challenge.id}
        onChange={event => setSelected(event.target.value)}>
        {filtered.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}
      </select></label>
      <article key={challenge.id} className="challenge-detail">
        <h3>{challenge.title}</h3>
        <p className="challenge-meta">{challenge.track} · {challenge.level} · {challenge.cases.length} public cases</p>
        <p>{challenge.goal}</p>
        <details><summary>Hints</summary><ol>{challenge.hints.map(hint => <li key={hint}>{hint}</li>)}</ol></details>
        <details><summary>Public input and output cases</summary>
          {challenge.cases.map(item => <article key={item.name} className="challenge-case">
            <strong>{item.name}</strong>
            <ChallengeOutput label="Input" value={item.stdin} />
            {item.expected.kind === 'output' && <>
              <ChallengeOutput label="Expected stdout" value={item.expected.stdout} />
              {item.expected.stderr && <ChallengeOutput label="Expected stderr" value={item.expected.stderr} />}
            </>}
          </article>)}
          <p>Quoted text shows exact whitespace and escaped line breaks. A final newline matters.</p>
        </details>
        <details><summary>Reveal reference solution</summary>
          <p>One possible implementation. Read it after attempting the exercise.</p>
          {Object.entries(challenge.solution.files).map(([path, code]) => <div key={path} className="challenge-solution">
            <strong>{path}</strong><pre>{code}</pre>
          </div>)}
        </details>
        <div className="test-case-actions">
          <button type="button" disabled={busy} onClick={() => onLoad(challenge)}>
            {loaded ? 'Reset starter' : 'Load starter'}
          </button>
          {loaded && (running ? <button type="button" onClick={onStop}>Stop challenge</button> :
            <button type="button" className="button-primary" disabled={busy} onClick={onRun}>Run challenge cases</button>)}
        </div>
        {loaded && running && <p role="status">Completed {progress} of {challenge.cases.length} cases…</p>}
        {visibleReport && <section className="test-case-report" aria-label="Challenge results">
          <h3>{passed} of {visibleReport.total} passed</h3>
          {visibleReport.state === 'complete' && passed === visibleReport.total && passed > 0 &&
            <p>All public cases passed.</p>}
          {visibleReport.error && <p role="status" className="test-case-error">{visibleReport.error}</p>}
          {visibleReport.results.map(item => <article className="test-case-result" key={item.name}>
            <strong>{item.name} — {item.status}</strong><p>{item.message}</p>
            {item.differences?.length ? <OutputDifferenceView differences={item.differences} /> : null}
            {(item.stdout || item.stderr) && <details><summary>Actual captured output</summary>
              <ChallengeOutput label="Actual stdout" value={item.stdout} />
              <ChallengeOutput label="Actual stderr" value={item.stderr} />
            </details>}
          </article>)}
          <TestReportControls report={visibleReport} suiteName={challenge.title} />
        </section>}
      </article>
    </>}
    <LearningProgressPanel active={active} report={report} running={running} />
  </section>;
}
