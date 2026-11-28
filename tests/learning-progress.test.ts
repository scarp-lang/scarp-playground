import { describe, expect, it } from 'vitest';
import { applyPracticeAttempt, attemptFromReport, emptyProgress, practiceStatus, summarizeProgress, validateProgress,
  type PracticeRecord, type PracticeAttempt } from '../src/challenges/progress';
import type { SuiteReport } from '../src/runner/test-cases';

const sha = 'a'.repeat(40);
const other = 'b'.repeat(40);
const challenge = { id: 'echo-name', track: 'Text', cases: [1, 2, 3] };
const attempt = (passed: number, at: number, compilerCommit = sha): PracticeAttempt =>
  ({ challengeId: challenge.id, compilerCommit, caseCount: 3, passed, at });

describe('learning progress metadata contract', () => {
  it('accepts only complete assertion runs and omits source and output', () => {
    const report: SuiteReport = { state: 'complete', total: 3, results: ['passed', 'failed', 'passed'].map((status, index) => ({
      name: 'case' + index, status: status as 'passed' | 'failed', message: 'private message', stdout: 'private output',
      stderr: '', diagnosticCode: null,
    })) };
    expect(attemptFromReport(challenge.id, sha, 3, report, 100)).toEqual(attempt(2, 100));
    expect(attemptFromReport(challenge.id, sha, 3, { ...report, state: 'cancelled' }, 100)).toBeNull();
    expect(attemptFromReport(challenge.id, sha, 3, { ...report, results: report.results.slice(0, 2) }, 100)).toBeNull();
    expect(attemptFromReport(challenge.id, sha, 3, { ...report, error: 'failed infrastructure' }, 100)).toBeNull();
    expect(attemptFromReport(challenge.id, sha, 3, { ...report, results: [{ ...report.results[0], status: 'execution-error' }, ...report.results.slice(1)] }, 100)).toBeNull();
  });
  it('tracks latest and best attempts without reducing the best score', () => {
    const first = applyPracticeAttempt(emptyProgress(), attempt(2, 1));
    if (!first.ok) throw Error(first.error);
    const second = applyPracticeAttempt(first.value, attempt(3, 2));
    if (!second.ok) throw Error(second.error);
    const third = applyPracticeAttempt(second.value, attempt(1, 3));
    if (!third.ok) throw Error(third.error);
    expect(third.value.records[0]).toMatchObject({ attempts: 3, bestPassed: 3, latestPassed: 1, latestAt: 3 });
    expect(practiceStatus(third.value.records[0], challenge, sha)).toBe('completed');
    expect(applyPracticeAttempt(third.value, attempt(3, 2)).ok).toBe(false);
  });
  it('marks prior compiler revisions outdated and resets attempt counts on a new revision', () => {
    const old = applyPracticeAttempt(emptyProgress(), attempt(3, 1));
    if (!old.ok) throw Error(old.error);
    expect(practiceStatus(old.value.records[0], challenge, other)).toBe('outdated');
    const next = applyPracticeAttempt(old.value, attempt(1, 2, other));
    if (!next.ok) throw Error(next.error);
    expect(next.value.records[0]).toMatchObject({ compilerCommit: other, attempts: 1, bestPassed: 1 });
    expect(practiceStatus(next.value.records[0], challenge, other)).toBe('in-progress');
  });
  it('rejects inconsistent counts, malformed identifiers, sparse records and duplicates', () => {
    const valid: PracticeRecord = { challengeId: 'x', compilerCommit: sha, caseCount: 2,
      attempts: 1, bestPassed: 1, latestPassed: 1, latestAt: 0 };
    for (const value of [null, { version: 2, records: [] }, { version: 1, records: Array(1) },
      { version: 1, records: [valid, valid] }, { version: 1, records: [{ ...valid, latestPassed: 2 }] },
      { version: 1, records: [{ ...valid, compilerCommit: 'invalid' }] },
      { version: 1, records: [{ ...valid, challengeId: '../unsafe' }] }]) expect(validateProgress(value).ok).toBe(false);
    const projected = validateProgress({ version: 1, records: [{ ...valid, source: 'private' }], stdin: 'private' });
    expect(JSON.stringify(projected)).not.toContain('private');
  });
  it('summarizes current catalogue and ignores deleted exercises', () => {
    const old = applyPracticeAttempt(emptyProgress(), attempt(3, 1));
    if (!old.ok) throw Error(old.error);
    const summary = summarizeProgress(old.value, [challenge, { id: 'other', track: 'Math', cases: [1] }], sha);
    expect(summary).toMatchObject({ total: 2, completed: 1, notStarted: 1, inProgress: 0 });
    expect(summary.tracks).toEqual([
      { track: 'Text', total: 1, completed: 1, inProgress: 0, outdated: 0, notStarted: 0 },
      { track: 'Math', total: 1, completed: 0, inProgress: 0, outdated: 0, notStarted: 1 },
    ]);
  });
});
