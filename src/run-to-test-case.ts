import type { RunResult } from './runner/types';
import { validatedRunResult } from './runner/protocol';
import {
  MAX_TEST_CASES, MAX_EXPECTED_OUTPUT_BYTES,
  validateTestCases, type TestCase,
} from './runner/test-cases';
import { MAX_PROGRAM_INPUT_BYTES } from './runner/limits';
import { isUtf8Text, measureUtf8 } from './utf8';
import { sameWorkspaceContents } from './session-safety';
import { validateWorkspace, type Workspace } from './workspace';

export const CAPTURE_CASE_NAME_PREFIX = 'Captured run ';
export const MAX_CAPTURE_REVIEW_BYTES = 256;

export type CapturedRun = Readonly<{
  workspace: Workspace;
  stdin: string;
  allowPrompts: boolean;
  result: RunResult;
}>;
export type RunCapturePreview = Readonly<{
  name: string;
  inputBytes: number;
  expectedBytes: number;
  kind: 'output' | 'diagnostic';
  diagnosticCode: string | null;
  sourceFiles: number;
  promptsAllowed: boolean;
  inputExcerpt: string;
  expectedExcerpt: string;
}>;
export type RunCapturePlan = { ok: true; cases: TestCase[]; preview: RunCapturePreview } |
  { ok: false; error: string };

function invalid(error: string): RunCapturePlan { return { ok: false, error }; }

function excerpt(value: string): string {
  if (value.length <= MAX_CAPTURE_REVIEW_BYTES) return value;
  let end = MAX_CAPTURE_REVIEW_BYTES;
  const code = value.charCodeAt(end - 1);
  if (code >= 0xd800 && code <= 0xdbff) end--;
  return value.slice(0, end) + '…';
}

function nextCaseName(existing: readonly TestCase[]): string | null {
  const names = new Set(existing.map(test => test.name));
  for (let number = 1; number < 10_000; number++) {
    const name = CAPTURE_CASE_NAME_PREFIX + number;
    if (!names.has(name)) return name;
  }
  return null;
}

/**
 * Capture a fully validated immutable source snapshot and program input from
 * a Run result. The caller must not pass Check or Verify as a Run result.
 * No browser storage, source mutation, network or test execution occurs here.
 */
export function makeCapturedRun(
  source: Workspace, stdin: string, allowPrompts: boolean, result: RunResult,
): CapturedRun | null {
  if (validateWorkspace(source) || !isUtf8Text(stdin, MAX_PROGRAM_INPUT_BYTES) ||
      typeof allowPrompts !== 'boolean' || !validatedRunResult(result)) return null;
  return {
    workspace: { entry: source.entry, files: { ...source.files } },
    stdin, allowPrompts,
    result: validatedRunResult(result)!,
  };
}

/**
 * The captured program's *same source contents* must still be loaded.
 * We never infer that stdout from an earlier source revision belongs to
 * the current program, even when it has the same entry filename.
 */
export function previewRunAsTestCase(
  workspace: Workspace, previous: unknown, captured: CapturedRun | null,
): RunCapturePlan {
  if (validateWorkspace(workspace)) return invalid('The current Scarp sources are invalid.');
  const existing = validateTestCases(previous);
  if (!existing.ok) return invalid('Correct the existing test definitions before adding a captured Run.');
  if (existing.cases.length >= MAX_TEST_CASES) {
    return invalid('At most eight test cases can be kept in one suite.');
  }
  if (!captured || validateWorkspace(captured.workspace) ||
      !sameWorkspaceContents(workspace, captured.workspace)) {
    return invalid('Run the current source first; this captured result belongs to different source text.');
  }
  if (typeof captured.allowPrompts !== 'boolean' ||
      !isUtf8Text(captured.stdin, MAX_PROGRAM_INPUT_BYTES)) {
    return invalid('The captured Run input is invalid or over its byte limit.');
  }
  const response = validatedRunResult(captured.result);
  if (!response) return invalid('The captured compiler result is invalid.');
  const name = nextCaseName(existing.cases);
  if (!name) return invalid('No unique captured Run test case name is available.');

  let expected: TestCase['expected'];
  let expectedPreview = '';
  if (response.ok) {
    if (!isUtf8Text(response.stdout, MAX_EXPECTED_OUTPUT_BYTES) ||
        !isUtf8Text(response.stderr, MAX_EXPECTED_OUTPUT_BYTES)) {
      return invalid('Captured output is too large for an exact 16 KiB test expectation.');
    }
    expected = { kind: 'output', stdout: response.stdout, stderr: response.stderr };
    expectedPreview = response.stdout || response.stderr;
  } else if (response.diagnostic && typeof response.diagnostic.code === 'string' &&
      /^E[0-9]{4}$/.test(response.diagnostic.code)) {
    expected = { kind: 'diagnostic', code: response.diagnostic.code };
    expectedPreview = response.diagnostic.code + ': ' + response.diagnostic.message;
  } else {
    return invalid('Only successful outputs or compiler-coded diagnostics can become test cases.');
  }

  const item: TestCase = {
    name, stdin: captured.stdin, allowPrompts: captured.allowPrompts, expected,
  };
  const next = validateTestCases([...existing.cases, item]);
  if (!next.ok) return invalid(next.error);
  const measured = measureUtf8(expectedPreview, Number.MAX_SAFE_INTEGER);
  if (!measured.ok) return invalid('Captured preview contains invalid Unicode.');
  const expectedBytes = expected.kind === 'output'
    ? new TextEncoder().encode(expected.stdout).byteLength +
      new TextEncoder().encode(expected.stderr).byteLength
    : new TextEncoder().encode(expected.code).byteLength;
  const inputBytes = new TextEncoder().encode(item.stdin).byteLength;
  return {
    ok: true,
    cases: next.cases,
    preview: {
      name, inputBytes, expectedBytes,
      kind: expected.kind,
      diagnosticCode: expected.kind === 'diagnostic' ? expected.code : null,
      sourceFiles: Object.keys(workspace.files).length,
      promptsAllowed: item.allowPrompts,
      inputExcerpt: excerpt(item.stdin),
      expectedExcerpt: excerpt(expectedPreview),
    },
  };
}
