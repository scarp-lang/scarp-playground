import { describe, expect, it } from 'vitest';
import {
  CAPTURE_CASE_NAME_PREFIX, MAX_CAPTURE_REVIEW_BYTES,
  makeCapturedRun, previewRunAsTestCase,
} from '../src/run-to-test-case';
import { MAX_EXPECTED_OUTPUT_BYTES, MAX_TEST_CASES, newTestCase } from '../src/runner/test-cases';
import type { RunResult } from '../src/runner/types';
import type { Workspace } from '../src/workspace';

const workspace = (): Workspace => ({
  entry: 'main.srp',
  files: { 'main.srp': 'print("Hello");\n', 'lib/helper.srp': 'pub bind value = 1;' },
});
const passed = (stdout = 'Hello\n', stderr = ''): RunResult =>
  ({ ok: true, stdout, stderr });
const failed = (code = 'E0085'): RunResult => ({
  ok: false, stdout: '', stderr: '', error: 'compiler error',
  diagnostic: {
    schema_version: 1, severity: 'error', code,
    message: 'compiler error', span_encoding: 'utf-8-bytes',
    column_encoding: 'unicode-scalar', position_base: 1,
  },
});
function capture(result: RunResult = passed(), input = '', prompts = false) {
  return makeCapturedRun(workspace(), input, prompts, result);
}
function preview(
  result: RunResult = passed(), cases = [newTestCase()],
  source = workspace(),
) {
  return previewRunAsTestCase(source, cases, makeCapturedRun(source, '', false, result));
}

describe('safe in-memory Run capture', () => {
  it('projects a successful compiler response and snapshots all original Scarp files', () => {
    const before = workspace();
    const result = makeCapturedRun(before, 'line\n', false, passed('Hello\n'));
    expect(result).not.toBeNull();
    expect(result?.workspace).not.toBe(before);
    expect(result?.workspace.files).not.toBe(before.files);
    expect(result?.workspace).toEqual(before);
    expect(result?.result).toEqual(passed('Hello\n'));
  });

  it('keeps exact buffered stdin, including final newline and Unicode', () => {
    const result = capture(passed('नमस्ते\n'), '😀 नमस्ते\r\n', true);
    expect(result?.stdin).toBe('😀 नमस्ते\r\n');
    expect(result?.allowPrompts).toBe(true);
  });

  it('never stores an extraneous worker field in the captured compiler result', () => {
    const result = makeCapturedRun(workspace(), '', false, {
      ...passed(), secret: 'PRIVATE',
    } as RunResult);
    expect(result).not.toBeNull();
    expect(JSON.stringify(result?.result)).not.toContain('PRIVATE');
  });

  it('rejects invalid source workspaces before copying their contents', () => {
    expect(makeCapturedRun({ entry: 'missing.srp', files: { 'main.srp': '' } },
      '', false, passed())).toBeNull();
    expect(makeCapturedRun(null as unknown as Workspace, '', false, passed())).toBeNull();
  });

  it('rejects prompt settings that are not true or false', () => {
    expect(makeCapturedRun(workspace(), '', 1 as unknown as boolean, passed())).toBeNull();
  });

  it('rejects malformed and over-budget or malformed-Unicode stdin', () => {
    expect(makeCapturedRun(workspace(), '\uD800', false, passed())).toBeNull();
    expect(makeCapturedRun(workspace(), 'x'.repeat(16 * 1024 + 1), false, passed())).toBeNull();
  });

  it('rejects corrupted compiler responses and malformed successful output envelopes', () => {
    expect(makeCapturedRun(workspace(), '', false, {
      ok: true, stdout: 'ok', stderr: '', error: 'should be impossible',
    })).toBeNull();
    expect(makeCapturedRun(workspace(), '', false, {
      ok: false, stdout: 'unexpected', stderr: '', error: 'failed',
    })).toBeNull();
  });

  it('refuses to derive a test case from an unrelated source snapshot', () => {
    const previous = capture();
    const now = workspace();
    now.files['main.srp'] = 'print("changed");';
    const result = previewRunAsTestCase(now, [newTestCase()], previous);
    expect(result.ok).toBe(false);
  });

  it('accepts byte-identical workspace copies after safe editor navigation', () => {
    const previous = capture();
    expect(previous).not.toBeNull();
    const result = previewRunAsTestCase(workspace(), [newTestCase()], previous);
    expect(result.ok).toBe(true);
  });
});

describe('reviewed regression test case creation', () => {
  it('converts exact stdout/stderr into one new test definition', () => {
    const result = preview(passed('Hello\n', 'warning\n'));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.cases).toHaveLength(2);
    expect(result.cases[1]).toEqual({
      name: CAPTURE_CASE_NAME_PREFIX + '1',
      stdin: '', allowPrompts: false,
      expected: { kind: 'output', stdout: 'Hello\n', stderr: 'warning\n' },
    });
    expect(result.preview.kind).toBe('output');
    expect(result.preview.sourceFiles).toBe(2);
  });

  it('captures a real compiler diagnostic code as an exact expected error', () => {
    const result = preview(failed('E0085'));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.cases.at(-1)?.expected).toEqual({ kind: 'diagnostic', code: 'E0085' });
    expect(result.preview.diagnosticCode).toBe('E0085');
  });

  it('rejects uncoded operational failures that cannot form reliable compiler tests', () => {
    const error: RunResult = {
      ok: false, stdout: '', stderr: '', error: 'The Worker timed out.',
    };
    expect(preview(error).ok).toBe(false);
  });

  it('preserves exact input and prompt permission in the new case', () => {
    const source = workspace();
    const previous = makeCapturedRun(source, 'one\ntwo\n', true, passed('two\n'));
    const result = previewRunAsTestCase(source, [newTestCase()], previous);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.cases[1].stdin).toBe('one\ntwo\n');
    expect(result.cases[1].allowPrompts).toBe(true);
    expect(result.preview.promptsAllowed).toBe(true);
  });

  it('rejects success output exceeding the exact test expectation byte budget', () => {
    expect(preview(passed('x'.repeat(MAX_EXPECTED_OUTPUT_BYTES + 1))).ok).toBe(false);
  });

  it('accepts a Unicode output exactly at the expected byte boundary', () => {
    const text = '😀'.repeat(MAX_EXPECTED_OUTPUT_BYTES / 4);
    const result = preview(passed(text));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.preview.expectedBytes).toBe(MAX_EXPECTED_OUTPUT_BYTES);
  });

  it('rejects the ninth test case instead of dropping or overwriting existing ones', () => {
    const cases = Array.from({ length: MAX_TEST_CASES }, (_, i) =>
      newTestCase('Case ' + (i + 1)));
    const result = preview(passed(), cases);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('eight');
  });

  it('refuses to capture when currently edited test definitions are invalid', () => {
    expect(previewRunAsTestCase(workspace(), [{ ...newTestCase(), name: '' }],
      capture()).ok).toBe(false);
  });

  it('generates a unique name when earlier captures exist', () => {
    const cases = [newTestCase(), newTestCase('Captured run 1'), newTestCase('Captured run 3')];
    const result = preview(passed(), cases);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.cases.at(-1)?.name).toBe('Captured run 2');
  });

  it('never overwrites the existing expected outputs or names', () => {
    const cases = [newTestCase('Original')];
    const original = JSON.stringify(cases);
    const result = preview(passed(), cases);
    expect(result.ok).toBe(true);
    expect(JSON.stringify(cases)).toBe(original);
  });

  it('validates the combined suite after addition and enforces aggregate quotas', () => {
    const cases = Array.from({ length: 7 }, (_, i) =>
      ({ ...newTestCase('Case ' + (i + 1)), stdin: 'a'.repeat(16 * 1024),
        expected: { kind: 'output' as const, stdout: 'b'.repeat(2 * 1024), stderr: '' },
      }));
    const result = preview(passed('c'.repeat(3 * 1024)), cases);
    expect(result.ok).toBe(false);
  });

  it('does not leak unbounded captured input into the confirmation preview', () => {
    const source = workspace();
    const captured = makeCapturedRun(source, '😀'.repeat(300), false, passed('OK\n'));
    const result = previewRunAsTestCase(source, [newTestCase()], captured);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.preview.inputExcerpt.length).toBeLessThanOrEqual(MAX_CAPTURE_REVIEW_BYTES + 1);
      expect(result.cases[1].stdin).toBe('😀'.repeat(300));
    }
  });

  it('truncates confirmation output but keeps the exact full test expectation', () => {
    const result = preview(passed('x'.repeat(1500)));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.preview.expectedExcerpt.length).toBeLessThanOrEqual(MAX_CAPTURE_REVIEW_BYTES + 1);
    const expected = result.cases[1].expected;
    expect(expected.kind).toBe('output');
    if (expected.kind === 'output') expect(expected.stdout.length).toBe(1500);
  });

  it('never stores source files or stdio in preview metadata', () => {
    const result = preview();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(Object.keys(result.preview).sort()).toEqual([
      'diagnosticCode', 'expectedBytes', 'expectedExcerpt',
      'inputBytes', 'inputExcerpt', 'kind', 'name',
      'promptsAllowed', 'sourceFiles',
    ]);
    expect(JSON.stringify(result.preview)).not.toContain('pub bind value = 1');
  });

  it('is deterministic for an identical source and compiler result', () => {
    const first = preview();
    const second = preview();
    expect(first).toEqual(second);
  });

  it('does not execute any test case during capture or preview', () => {
    const first = capture();
    expect(first?.result.ok).toBe(true);
    const result = previewRunAsTestCase(workspace(), [newTestCase()], first);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.cases).toHaveLength(2);
  });
});
