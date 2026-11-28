import type { SuiteReport } from '../runner/test-cases';
import { MAX_TEST_CASES } from '../runner/test-cases';

export const MAX_PROGRESS_ITEMS = 100;
export const MAX_ATTEMPTS = 9999;
export const PROGRESS_VERSION = 1;
export type PracticeResult = 'passed' | 'partial' | 'failed';
export type PracticeRecord = {
  challengeId: string;
  compilerCommit: string;
  caseCount: number;
  attempts: number;
  bestPassed: number;
  latestPassed: number;
  latestAt: number;
};
export type PracticeProgress = { version: 1; records: PracticeRecord[] };
export type ProgressResult<T> = { ok: true; value: T } | { ok: false; error: string };
const fail = (error: string): { ok: false; error: string } => ({ ok: false, error });
const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const int = (value: unknown, min: number, max: number): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= min && value <= max;
const id = (value: unknown): value is string => typeof value === 'string' && /^[a-z][a-z0-9-]{0,63}$/.test(value);
const sha = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{40}$/.test(value);
const date = (value: unknown): value is number => int(value, 0, 8_640_000_000_000_000);

export function emptyProgress(): PracticeProgress { return { version: 1, records: [] }; }

/** Metadata only. The projection rejects invalid totals and never retains
 * code, case input, output, compiler messages or arbitrary object fields. */
export function validateProgress(value: unknown): ProgressResult<PracticeProgress> {
  if (!record(value) || value.version !== PROGRESS_VERSION || !Array.isArray(value.records) ||
      value.records.length > MAX_PROGRESS_ITEMS) return fail('Unsupported or invalid learning progress.');
  const records: PracticeRecord[] = [];
  const seen = new Set<string>();
  for (const item of value.records) {
    if (!record(item) || !id(item.challengeId) || seen.has(item.challengeId) || !sha(item.compilerCommit) ||
        !int(item.caseCount, 1, MAX_TEST_CASES) || !int(item.attempts, 1, MAX_ATTEMPTS) ||
        !int(item.bestPassed, 0, item.caseCount) || !int(item.latestPassed, 0, item.bestPassed) || !date(item.latestAt)) {
      return fail('Learning progress contains invalid practice metadata.');
    }
    seen.add(item.challengeId);
    records.push({ challengeId: item.challengeId, compilerCommit: item.compilerCommit, caseCount: item.caseCount,
      attempts: item.attempts, bestPassed: item.bestPassed, latestPassed: item.latestPassed, latestAt: item.latestAt });
  }
  records.sort((a, b) => a.challengeId < b.challengeId ? -1 : a.challengeId > b.challengeId ? 1 : 0);
  return { ok: true, value: { version: 1, records } };
}

export type PracticeAttempt = { challengeId: string; compilerCommit: string; caseCount: number; passed: number; at: number };

/** Only fully executed assertion suites count as practice attempts.
 * Infrastructure errors, cancellation and incomplete cases are not failures. */
export function attemptFromReport(challengeId: string, compilerCommit: string, caseCount: number,
  report: SuiteReport, at: number): PracticeAttempt | null {
  if (!id(challengeId) || !sha(compilerCommit) || !int(caseCount, 1, MAX_TEST_CASES) || !date(at) ||
      report.state !== 'complete' || report.error || report.total !== caseCount || report.results.length !== caseCount ||
      report.results.some(item => item.status !== 'passed' && item.status !== 'failed')) return null;
  return { challengeId, compilerCommit, caseCount, passed: report.results.filter(item => item.status === 'passed').length, at };
}

export function applyPracticeAttempt(current: PracticeProgress, attempt: PracticeAttempt): ProgressResult<PracticeProgress> {
  const checked = validateProgress(current);
  if (!checked.ok) return checked;
  if (!id(attempt.challengeId) || !sha(attempt.compilerCommit) || !int(attempt.caseCount, 1, MAX_TEST_CASES) ||
      !int(attempt.passed, 0, attempt.caseCount) || !date(attempt.at)) return fail('Invalid practice attempt.');
  const records = checked.value.records;
  const index = records.findIndex(item => item.challengeId === attempt.challengeId);
  const previous = records[index];
  const sameRevision = previous?.compilerCommit === attempt.compilerCommit && previous.caseCount === attempt.caseCount;
  // Do not count an outdated report as a newer latest result. The transaction
  // stores the best result for the active compiler revision only.
  if (sameRevision && previous.latestAt > attempt.at) return fail('A newer attempt has already been recorded.');
  const next: PracticeRecord = { challengeId: attempt.challengeId, compilerCommit: attempt.compilerCommit,
    caseCount: attempt.caseCount, attempts: sameRevision ? Math.min(MAX_ATTEMPTS, previous.attempts + 1) : 1,
    bestPassed: sameRevision ? Math.max(previous.bestPassed, attempt.passed) : attempt.passed,
    latestPassed: attempt.passed, latestAt: attempt.at };
  if (index < 0) records.push(next);
  else records[index] = next;
  return validateProgress({ version: 1, records });
}

export type PracticeDescriptor = { id: string; track: string; cases: readonly unknown[] };
export type PracticeStatus = 'not-started' | 'in-progress' | 'completed' | 'outdated';
export function practiceStatus(record: PracticeRecord | undefined, challenge: PracticeDescriptor,
  compilerCommit: string): PracticeStatus {
  if (!record) return 'not-started';
  if (record.compilerCommit !== compilerCommit || record.caseCount !== challenge.cases.length) return 'outdated';
  return record.bestPassed === record.caseCount ? 'completed' : 'in-progress';
}

export function summarizeProgress(progress: PracticeProgress, catalogue: readonly PracticeDescriptor[], commit: string) {
  const statuses = new Map(progress.records.map(item => [item.challengeId, item]));
  const tracks = [...new Set(catalogue.map(challenge => challenge.track))];
  const count = (items: readonly PracticeDescriptor[]) => {
    const result = { total: items.length, completed: 0, inProgress: 0, outdated: 0, notStarted: 0 };
    for (const challenge of items) {
      switch (practiceStatus(statuses.get(challenge.id), challenge, commit)) {
        case 'completed': result.completed++; break;
        case 'in-progress': result.inProgress++; break;
        case 'outdated': result.outdated++; break;
        default: result.notStarted++; break;
      }
    }
    return result;
  };
  return { ...count(catalogue), tracks: tracks.map(track => ({ track, ...count(catalogue.filter(item => item.track === track)) })) };
}
