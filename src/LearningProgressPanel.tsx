import { useEffect, useRef, useState } from 'react';
import compilerCompatibility from '../compiler-compatibility.json';
import { challenges, type Challenge } from './challenges/model';
import { attemptFromReport, practiceStatus, summarizeProgress, type PracticeProgress } from './challenges/progress';
import { clearPracticeProgress, readPracticeProgress, savePracticeAttempt } from './challenges/progress-store';
import type { SuiteReport } from './runner/test-cases';

// Reports are immutable session artifacts. Prevent recording the same run
// repeatedly even when this optional panel is closed and reopened.
const recordedReports = new WeakSet<SuiteReport>();

type Props = { active: Challenge | null; report: SuiteReport | null; running: boolean };

export function LearningProgressPanel({ active, report, running }: Props) {
  const [progress, setProgress] = useState<PracticeProgress | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const generation = useRef(0);
  const pending = useRef(false);
  useEffect(() => () => { generation.current++; pending.current = false; }, []);
  const eligible = active && report ? attemptFromReport(active.id, compilerCompatibility.commit,
    active.cases.length, report, Date.now()) : null;
  const recorded = report ? recordedReports.has(report) : false;

  async function refresh() {
    if (pending.current) return;
    const token = ++generation.current;
    pending.current = true; setBusy(true);
    try {
      const result = await readPracticeProgress(window.indexedDB);
      if (token !== generation.current) return;
      if (result.ok) { setProgress(result.value); setNotice('Loaded local practice progress.'); }
      else setNotice(result.error);
    } catch { if (token === generation.current) setNotice('Learning progress storage is unavailable.'); }
    finally { if (token === generation.current) { pending.current = false; setBusy(false); } }
  }

  async function save() {
    if (!eligible || !report || recordedReports.has(report) || pending.current || running) return;
    const token = ++generation.current;
    pending.current = true; setBusy(true);
    try {
      const result = await savePracticeAttempt(window.indexedDB, eligible);
      if (result.ok) recordedReports.add(report);
      if (token !== generation.current) return;
      if (result.ok) { setProgress(result.value); setNotice('Recorded this practice attempt.'); }
      else setNotice(result.error);
    } catch { if (token === generation.current) setNotice('Unable to save practice progress.'); }
    finally { if (token === generation.current) { pending.current = false; setBusy(false); } }
  }

  async function clear() {
    if (pending.current || !window.confirm('Delete all saved learning progress on this browser? Source files and saved projects will stay unchanged.')) return;
    const token = ++generation.current;
    pending.current = true; setBusy(true);
    try {
      const result = await clearPracticeProgress(window.indexedDB);
      if (token !== generation.current) return;
      if (result.ok) { setProgress(result.value); setNotice('Deleted local learning progress.'); }
      else setNotice(result.error);
    } catch { if (token === generation.current) setNotice('Unable to clear learning progress.'); }
    finally { if (token === generation.current) { pending.current = false; setBusy(false); } }
  }

  const summary = progress ? summarizeProgress(progress, challenges, compilerCompatibility.commit) : null;
  const current = active && progress ? progress.records.find(item => item.challengeId === active.id) : undefined;
  return <section className="learning-progress" aria-label="Local learning progress">
    <h3>Local learning progress</h3>
    <p>Record practice attempts explicitly. Only challenge IDs, case counts, compiler commit, attempt counts and completion date are saved. No code, test input or output is stored.</p>
    <div className="test-case-actions">
      <button type="button" disabled={busy} onClick={() => void refresh()}>{progress ? 'Refresh progress' : 'View saved progress'}</button>
      <button type="button" disabled={busy || running || !eligible || recorded} onClick={() => void save()}>
        {recorded ? 'Attempt recorded' : 'Record practice attempt'}
      </button>
      {progress && <button type="button" disabled={busy || progress.records.length === 0} onClick={() => void clear()}>Clear learning progress</button>}
    </div>
    {notice && <p role="status">{notice}</p>}
    {summary && <>
      <p role="status">{summary.completed} of {summary.total} challenges completed · {summary.inProgress} in progress · {summary.outdated} need rechecking</p>
      <progress max={summary.total} value={summary.completed} aria-label="Completed learning challenges" />
      <ul className="learning-progress-tracks">{summary.tracks.map(track => <li key={track.track}>
        <span>{track.track}</span><progress max={track.total} value={track.completed}
          aria-label={track.track + ' completed'} /><span>{track.completed}/{track.total}</span>
      </li>)}</ul>
      {active && current && <p>Current challenge: {practiceStatus(current, active, compilerCompatibility.commit)} · best {current.bestPassed}/{current.caseCount} · {current.attempts} attempts.</p>}
      <p>Completion means all public cases passed under this compiler version. It is not certification or proof for unseen inputs.</p>
    </>}
  </section>;
}
