import type { SuiteReport, CaseResult } from './test-cases';
import { MAX_TEST_CASES } from './test-cases';

export type ReportMetadata = {
  compilerVersion: string;
  compilerCommit: string;
  suiteName: string;
};
export type ReportOptions = { includeOutput: boolean };
export type ReportCounts = { total: number; passed: number; failed: number; errors: number; notRun: number };

export function reportCounts(report: SuiteReport): ReportCounts {
  return {
    total: report.total,
    passed: report.results.filter(item => item.status === 'passed').length,
    failed: report.results.filter(item => item.status === 'failed').length,
    errors: report.results.filter(item => item.status === 'execution-error').length,
    notRun: report.total - report.results.length,
  };
}

/** Check the report's cardinality and status invariants before export.
 * Export uses only known fields, no source or case inputs. */
function validReport(report: SuiteReport): boolean {
  return Number.isInteger(report.total) && report.total >= 0 && report.total <= MAX_TEST_CASES &&
    report.results.length <= report.total &&
    ['complete', 'cancelled', 'invalid'].includes(report.state) &&
    report.results.every(item => ['passed', 'failed', 'execution-error'].includes(item.status));
}

function summaryMessage(item: CaseResult): string {
  // Compiler diagnostics and infrastructure error strings may include input
  // or source. Summary-only files deliberately omit their freeform text.
  if (item.status === 'passed') return 'Case passed.';
  if (item.status === 'execution-error') return 'Execution infrastructure error.';
  return 'Case did not match its expected result.';
}

export function serializeTestReport(report: SuiteReport, metadata: ReportMetadata, options: ReportOptions): string | null {
  if (!validReport(report)) return null;
  return JSON.stringify({
    format: 'scarp-playground-test-report', version: 1,
    compiler: { version: metadata.compilerVersion, commit: metadata.compilerCommit },
    suite: metadata.suiteName, state: report.state, counts: reportCounts(report),
    outputIncluded: options.includeOutput,
    results: report.results.map(item => ({
      name: item.name, status: item.status, diagnosticCode: item.diagnosticCode,
      message: options.includeOutput ? item.message : summaryMessage(item),
      ...(options.includeOutput ? { stdoutPreview: item.stdout, stderrPreview: item.stderr,
        differences: item.differences?.map(diff => ({
          stream: diff.stream, offset: diff.offset, line: diff.line, column: diff.column,
          expectedUnits: diff.expectedUnits, actualUnits: diff.actualUnits,
          expectedBytes: diff.expectedBytes, actualBytes: diff.actualBytes,
          expected: { ...diff.expected }, actual: { ...diff.actual },
        })) ?? [] } : {}),
    })),
    ...(options.includeOutput && report.error ? { error: report.error } : {}),
  }, null, 2) + '\n';
}

/** XML 1.0 text and attribute content; encode invalid controls as visible
 * text rather than generating a malformed JUnit artifact. */
export function xmlText(value: string): string {
  return [...value].map(char => {
    const cp = char.codePointAt(0)!;
    if (cp !== 9 && cp !== 10 && cp !== 13 &&
      !(cp >= 32 && cp <= 0xd7ff) && !(cp >= 0xe000 && cp <= 0xfffd) &&
      !(cp >= 0x10000 && cp <= 0x10ffff)) return '[U+' + cp.toString(16).toUpperCase() + ']';
    return char;
  }).join('').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

export function serializeJUnitReport(report: SuiteReport, metadata: ReportMetadata, options: ReportOptions): string | null {
  if (!validReport(report)) return null;
  const count = reportCounts(report);
  const name = xmlText(metadata.suiteName);
  const lines = ['<?xml version="1.0" encoding="UTF-8"?>',
    '<testsuite name="' + name + '" tests="' + count.total + '" failures="' + count.failed +
      '" errors="' + count.errors + '" skipped="' + count.notRun + '">',
    '  <properties>',
    '    <property name="scarp.version" value="' + xmlText(metadata.compilerVersion) + '"/>',
    '    <property name="scarp.commit" value="' + xmlText(metadata.compilerCommit) + '"/>',
    '    <property name="playground.report.state" value="' + report.state + '"/>',
    '    <property name="playground.output.preview.included" value="' + options.includeOutput + '"/>',
    '  </properties>'];
  for (const item of report.results) {
    lines.push('  <testcase classname="' + name + '" name="' + xmlText(item.name) + '">');
    const message = xmlText(options.includeOutput ? item.message : summaryMessage(item));
    if (item.status === 'failed') lines.push('    <failure message="' + message + '"/>');
    if (item.status === 'execution-error') lines.push('    <error message="' + message + '"/>');
    if (options.includeOutput) {
      if (item.stdout) lines.push('    <system-out>' + xmlText(item.stdout) + '</system-out>');
      if (item.stderr) lines.push('    <system-err>' + xmlText(item.stderr) + '</system-err>');
    }
    lines.push('  </testcase>');
  }
  for (let i = 0; i < count.notRun; i++) {
    lines.push('  <testcase classname="' + name + '" name="Unexecuted case ' + (report.results.length + i + 1) + '"><skipped message="Not run"/></testcase>');
  }
  lines.push('</testsuite>');
  return lines.join('\n') + '\n';
}
