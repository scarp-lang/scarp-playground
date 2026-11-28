import { describe, expect, it } from 'vitest';
import { reportCounts, serializeJUnitReport, serializeTestReport, xmlText } from '../src/runner/test-report';
import type { SuiteReport } from '../src/runner/test-cases';
import { describeOutputDifference } from '../src/runner/output-difference';

const metadata = { compilerVersion: '0.0.7-alpha.4', compilerCommit: 'abc123', suiteName: 'Test & suite' };
const report: SuiteReport = { state: 'complete', total: 4, error: 'private error text', results: [
  { name: 'first', status: 'passed', message: 'private message', stdout: 'secret stdout', stderr: '', diagnosticCode: null },
  { name: '<second>', status: 'failed', message: 'secret mismatch', stdout: 'A\u0000', stderr: '', diagnosticCode: null,
    differences: [describeOutputDifference('stdout', 'a', 'A')!] },
  { name: 'third', status: 'execution-error', message: 'secret error', stdout: '', stderr: '', diagnosticCode: 'E0010' },
] };

describe('portable test report exports', () => {
  it('counts only completed results and preserves not-run state', () => {
    expect(reportCounts(report)).toEqual({ total: 4, passed: 1, failed: 1, errors: 1, notRun: 1 });
  });
  it('default JSON excludes output, mismatch context and freeform diagnostic text', () => {
    const text = serializeTestReport(report, metadata, { includeOutput: false })!;
    expect(text).not.toContain('secret');
    expect(text).not.toContain('private');
    const parsed = JSON.parse(text);
    expect(parsed.format).toBe('scarp-playground-test-report');
    expect(parsed.results[2].diagnosticCode).toBe('E0010');
    expect(parsed.counts.notRun).toBe(1);
    expect(parsed.results[1].differences).toBeUndefined();
  });
  it('detailed JSON contains only projected bounded output and differences', () => {
    const polluted = { ...report, stdin: 'not exported', workspace: 'not exported' };
    const text = serializeTestReport(polluted, metadata, { includeOutput: true })!;
    const parsed = JSON.parse(text);
    expect(text).not.toContain('not exported');
    expect(parsed.results[0].stdoutPreview).toBe('secret stdout');
    expect(parsed.results[1].differences[0].expected.scalar).toBe('a');
  });
  it('produces escaped JUnit XML with explicit skipped and error elements', () => {
    const summary = serializeJUnitReport(report, metadata, { includeOutput: false })!;
    expect(summary).toContain('tests="4" failures="1" errors="1" skipped="1"');
    expect(summary).toContain('name="Test &amp; suite"');
    expect(summary).toContain('name="&lt;second&gt;"');
    expect(summary).toContain('<skipped message="Not run"/>');
    expect(summary).not.toContain('secret');
    const detailed = serializeJUnitReport(report, metadata, { includeOutput: true })!;
    expect(detailed).toContain('<system-out>A[U+0]</system-out>');
    expect(xmlText('a<&>"\'\ud800')).toBe('a&lt;&amp;&gt;&quot;&apos;[U+D800]');
  });
  it('rejects inconsistent counts rather than fabricating a report', () => {
    expect(serializeTestReport({ ...report, total: 1 }, metadata, { includeOutput: false })).toBeNull();
    expect(serializeJUnitReport({ ...report, total: 999 }, metadata, { includeOutput: false })).toBeNull();
  });
});
