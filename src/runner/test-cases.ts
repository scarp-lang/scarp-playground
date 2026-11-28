import { MAX_PROGRAM_INPUT_BYTES } from './limits';
import { validatedRunResult } from './protocol';
import type { RunResult } from './types';
import { validateWorkspace, type Workspace } from '../workspace';

export const MAX_TEST_CASES = 8;
export const MAX_EXPECTED_OUTPUT_BYTES = 16 * 1024;
export const MAX_SUITE_TEXT_BYTES = 128 * 1024;
export const MAX_CASE_NAME_LENGTH = 80;
export const MAX_RESULT_EXCERPT = 4096;

export type TestCase = {
  name: string;
  stdin: string;
  allowPrompts: boolean;
  expected: { kind: 'output'; stdout: string; stderr: string } |
    { kind: 'diagnostic'; code: string };
};

export type CaseResult = {
  name: string;
  status: 'passed' | 'failed' | 'execution-error';
  message: string;
  stdout: string;
  stderr: string;
  diagnosticCode: string | null;
};

export type SuiteReport = {
  total: number;
  results: CaseResult[];
  state: 'complete' | 'cancelled' | 'invalid';
  error?: string;
};

type Execute = (workspace: Workspace, signal: AbortSignal, stdin: string, allowPrompts: boolean) => Promise<RunResult>;

const encoder = new TextEncoder();
const bytes = (text: string) => encoder.encode(text).byteLength;
const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function boundedText(value: unknown, limit: number): value is string {
  return typeof value === 'string' && value.length <= limit && bytes(value) <= limit;
}

export function newTestCase(name = 'Case 1', stdin = '', allowPrompts = false): TestCase {
  return { name, stdin, allowPrompts, expected: { kind: 'output', stdout: '', stderr: '' } };
}

/** Validate runtime data, project only known fields and detach all test inputs. */
export function validateTestCases(value: unknown): { ok: true; cases: TestCase[] } | { ok: false; error: string } {
  if (!Array.isArray(value) || value.length < 1 || value.length > MAX_TEST_CASES) {
    return { ok: false, error: 'A test suite needs between 1 and 8 cases.' };
  }
  const cases: TestCase[] = [];
  let totalBytes = 0;
  const names = new Set<string>();
  for (const [index, item] of value.entries()) {
    const prefix = 'Case ' + (index + 1) + ': ';
    if (!record(item) || !boundedText(item.name, MAX_CASE_NAME_LENGTH) || !item.name.trim() ||
        item.name !== item.name.trim() || /[\r\n]/.test(item.name)) {
      return { ok: false, error: prefix + 'enter a nonempty name of at most 80 UTF-8 bytes.' };
    }
    if (names.has(item.name)) return { ok: false, error: prefix + 'case names must be unique.' };
    names.add(item.name);
    if (!boundedText(item.stdin, MAX_PROGRAM_INPUT_BYTES) || typeof item.allowPrompts !== 'boolean') {
      return { ok: false, error: prefix + 'stdin must be text of at most 16 KiB with an explicit prompt mode.' };
    }
    if (!record(item.expected)) return { ok: false, error: prefix + 'select an expected result.' };
    let expected: TestCase['expected'];
    if (item.expected.kind === 'output') {
      const { stdout, stderr } = item.expected;
      if (!boundedText(stdout, MAX_EXPECTED_OUTPUT_BYTES) || !boundedText(stderr, MAX_EXPECTED_OUTPUT_BYTES)) {
        return { ok: false, error: prefix + 'expected stdout and stderr are limited to 16 KiB each.' };
      }
      expected = { kind: 'output', stdout, stderr };
      totalBytes += bytes(stdout) + bytes(stderr);
    } else if (item.expected.kind === 'diagnostic') {
      const code = item.expected.code;
      if (typeof code !== 'string' || !/^E[0-9]{4}$/.test(code)) {
        return { ok: false, error: prefix + 'enter a compiler diagnostic code such as E0085.' };
      }
      expected = { kind: 'diagnostic', code };
      totalBytes += bytes(code);
    } else {
      return { ok: false, error: prefix + 'unknown expected result kind.' };
    }
    totalBytes += bytes(item.name) + bytes(item.stdin);
    if (totalBytes > MAX_SUITE_TEXT_BYTES) {
      return { ok: false, error: 'Test case text exceeds the 128 KiB aggregate limit.' };
    }
    cases.push({ name: item.name, stdin: item.stdin, allowPrompts: item.allowPrompts, expected });
  }
  return { ok: true, cases };
}

function excerpt(value: string): string {
  if (value.length <= MAX_RESULT_EXCERPT) return value;
  // Do not retain the full compiler output in the report. Compare first.
  let end = MAX_RESULT_EXCERPT;
  const unit = value.charCodeAt(end - 1);
  if (unit >= 0xd800 && unit <= 0xdbff) end--;
  return value.slice(0, end) + '\n[display truncated]';
}

function firstDifference(expected: string, actual: string): string {
  let index = 0;
  const limit = Math.min(expected.length, actual.length);
  while (index < limit && expected[index] === actual[index]) index++;
  if (index === limit) return 'length differs (expected ' + expected.length + ', actual ' + actual.length + ' UTF-16 units)';
  const line = expected.slice(0, index).split(/\r\n|\r|\n/).length;
  return 'first difference on line ' + line + ' at UTF-16 offset ' + index;
}

function compareCase(test: TestCase, reply: unknown): CaseResult {
  const result = validatedRunResult(reply);
  const base = { name: test.name, stdout: '', stderr: '', diagnosticCode: null };
  if (!result) return { ...base, status: 'execution-error', message: 'Invalid compiler response.' };
  const code = result.diagnostic?.code ?? null;
  const display = { ...base, stdout: excerpt(result.stdout), stderr: excerpt(result.stderr), diagnosticCode: code };
  if (!result.ok && !code) {
    return { ...display, status: 'execution-error',
      message: excerpt(result.error || result.diagnostic?.message || 'Compiler execution failed without a diagnostic code.') };
  }
  if (test.expected.kind === 'diagnostic') {
    if (!result.ok && code === test.expected.code) {
      return { ...display, status: 'passed', message: 'Received expected compiler diagnostic ' + code + '.' };
    }
    return { ...display, status: 'failed', message: 'Expected ' + test.expected.code +
      ', received ' + (result.ok ? 'successful execution' : code) + '.' };
  }
  if (!result.ok) return { ...display, status: 'failed', message: 'Unexpected compiler diagnostic ' + code + '.' };
  const mismatches: string[] = [];
  if (result.stdout !== test.expected.stdout) mismatches.push('stdout: ' + firstDifference(test.expected.stdout, result.stdout));
  if (result.stderr !== test.expected.stderr) mismatches.push('stderr: ' + firstDifference(test.expected.stderr, result.stderr));
  return { ...display, status: mismatches.length ? 'failed' : 'passed',
    message: mismatches.length ? mismatches.join('; ') : 'Exact stdout and stderr match.' };
}

/**
 * One immutable workspace and one disposable compiler per case. Never call
 * the executor concurrently; stop immediately after cancellation or an
 * infrastructure/protocol failure rather than reporting later cases as
 * ordinary assertion failures. Output comparison includes trailing newlines.
 */
export async function runTestCases(
  workspace: Workspace,
  input: unknown,
  signal: AbortSignal,
  execute: Execute,
  onProgress?: (completed: readonly CaseResult[], total: number) => void,
): Promise<SuiteReport> {
  const problem = validateWorkspace(workspace);
  const validated = validateTestCases(input);
  if (problem || !validated.ok) {
    return { total: 0, results: [], state: 'invalid',
      error: problem ?? (validated.ok ? 'Invalid test suite.' : validated.error) };
  }
  const snapshot = { entry: workspace.entry, files: { ...workspace.files } };
  const cases = validated.cases;
  const results: CaseResult[] = [];
  const report = (state: SuiteReport['state'], error?: string): SuiteReport =>
    ({ total: cases.length, results: results.slice(), state, ...(error ? { error } : {}) });
  if (signal.aborted) return report('cancelled');
  for (const test of cases) {
    if (signal.aborted) return report('cancelled');
    let result: CaseResult;
    try {
      const reply = await execute(snapshot, signal, test.stdin, test.allowPrompts);
      if (signal.aborted) return report('cancelled');
      result = compareCase(test, reply);
    } catch {
      if (signal.aborted) return report('cancelled');
      result = { name: test.name, status: 'execution-error', message: 'Compiler executor failed.',
        stdout: '', stderr: '', diagnosticCode: null };
    }
    results.push(result);
    onProgress?.(results.map(item => ({ ...item })), cases.length);
    if (result.status === 'execution-error') {
      return report('complete', 'Stopped after an execution error; remaining cases were not run.');
    }
  }
  return report('complete');
}
