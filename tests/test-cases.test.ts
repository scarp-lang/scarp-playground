import { describe, expect, it, vi } from 'vitest';
import { MAX_TEST_CASES, MAX_RESULT_EXCERPT, newTestCase, runTestCases, validateTestCases, type TestCase } from '../src/runner/test-cases';
import type { RunResult } from '../src/runner/types';

const workspace = { entry: 'main.srp', files: { 'main.srp': 'print(read_line());' } };
const output = (stdout: string, stderr = ''): RunResult => ({ ok: true, stdout, stderr });
const failure = (code: string): RunResult => ({
  ok: false, stdout: '', stderr: '', error: 'compiler error',
  diagnostic: { schema_version: 1, severity: 'error', code, message: 'compiler error',
    span_encoding: 'utf-8-bytes', column_encoding: 'unicode-scalar', position_base: 1 },
});
const expected = (name: string, stdin: string, stdout: string, stderr = ''): TestCase =>
  ({ name, stdin, allowPrompts: false, expected: { kind: 'output', stdout, stderr } });

describe('bounded test case validation', () => {
  it('projects and detaches accepted cases without unknown fields', () => {
    const original = { ...expected('Unicode', 'नमस्ते\n', 'नमस्ते\n'), extra: { secret: 'not copied' } };
    const result = validateTestCases([original]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.cases).toEqual([expected('Unicode', 'नमस्ते\n', 'नमस्ते\n')]);
    expect(result.cases[0].expected).not.toBe(original.expected);
  });

  it('rejects malformed, duplicate, sparse and oversized cases before executing', () => {
    for (const cases of [
      [], Array(1), Array.from({ length: MAX_TEST_CASES + 1 }, (_, i) => newTestCase('Case ' + i)),
      [newTestCase('same'), newTestCase('same')], [newTestCase(' ')], [newTestCase(' newline\n')],
      [{ ...newTestCase(), stdin: '😀'.repeat(4097) }],
      [{ ...newTestCase(), allowPrompts: 1 }],
      [{ ...newTestCase(), expected: { kind: 'diagnostic', code: 'E123' } }],
      [expected('large', '', 'x'.repeat(16385))],
      Array.from({ length: 4 }, (_, i) => expected('Case ' + i, 'a'.repeat(16384), 'b'.repeat(16384), 'c'.repeat(16384))),
    ]) expect(validateTestCases(cases).ok).toBe(false);
  });
});

describe('sequential executor contract', () => {
  it('runs cases separately and compares exact output, including trailing newlines', async () => {
    const calls: string[] = [];
    let active = 0;
    const progress: number[] = [];
    const cases = [expected('one', 'a', 'a\n'), expected('two', 'b', 'b'), expected('three', 'c', 'c\n', 'note')];
    const report = await runTestCases(workspace, cases, new AbortController().signal, async (_source, _signal, stdin) => {
      active++;
      expect(active).toBe(1);
      calls.push(stdin);
      await Promise.resolve();
      active--;
      return output(stdin + '\n', stdin === 'c' ? 'note' : '');
    }, (done, total) => { expect(total).toBe(3); progress.push(done.length); });
    expect(calls).toEqual(['a', 'b', 'c']);
    expect(progress).toEqual([1, 2, 3]);
    expect(report.results.map(item => item.status)).toEqual(['passed', 'failed', 'passed']);
    expect(report.results[1].message).toContain('length differs');
  });

  it('requires real diagnostic codes and distinguishes infrastructure errors', async () => {
    const cases: TestCase[] = [
      { ...newTestCase('expected'), expected: { kind: 'diagnostic', code: 'E0085' } },
      { ...newTestCase('wrong'), expected: { kind: 'diagnostic', code: 'E0086' } },
      newTestCase('unexpected'), newTestCase('infrastructure'), newTestCase('not run'),
    ];
    const executor = vi.fn().mockResolvedValueOnce(failure('E0085')).mockResolvedValueOnce(failure('E0085'))
      .mockResolvedValueOnce(failure('E0086')).mockResolvedValueOnce({ ok: false, stdout: '', stderr: '', error: 'Worker crashed' });
    const report = await runTestCases(workspace, cases, new AbortController().signal, executor);
    expect(executor).toHaveBeenCalledTimes(4);
    expect(report.results.map(item => item.status)).toEqual(['passed', 'failed', 'failed', 'execution-error']);
    expect(report.error).toContain('remaining cases were not run');
    expect(report.total).toBe(5);
  });

  it('cancels before execution or during a worker without publishing late results', async () => {
    const controller = new AbortController();
    const execute = vi.fn(async () => { controller.abort(); return output('late'); });
    const progress = vi.fn();
    const report = await runTestCases(workspace, [newTestCase(), newTestCase('Case 2')], controller.signal, execute, progress);
    expect(report.state).toBe('cancelled');
    expect(report.results).toEqual([]);
    expect(progress).not.toHaveBeenCalled();
    expect(execute).toHaveBeenCalledTimes(1);
    await runTestCases(workspace, [newTestCase()], controller.signal, execute);
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it('compares full output but retains bounded previews and detached progress', async () => {
    const exact = 'a'.repeat(MAX_RESULT_EXCERPT - 1) + '😀tail\n';
    const report = await runTestCases(workspace, [expected('long', '', exact)], new AbortController().signal,
      async () => output(exact), completed => { completed[0].message = 'mutated callback'; });
    expect(report.results[0].status).toBe('passed');
    expect(report.results[0].stdout).toBe('a'.repeat(MAX_RESULT_EXCERPT - 1) + '\n[display truncated]');
    expect(report.results[0].message).toBe('Exact stdout and stderr match.');
  });

  it('detaches workspace and case configuration and rejects invalid source', async () => {
    const source = { entry: 'main.srp', files: { 'main.srp': 'original' } };
    const cases = [expected('first', 'first', ''), expected('second', 'second', '')];
    const seen: string[] = [];
    const report = await runTestCases(source, cases, new AbortController().signal, async (snapshot, _signal, stdin) => {
      seen.push(snapshot.files['main.srp'] + ':' + stdin);
      source.files['main.srp'] = 'changed';
      cases[1].stdin = 'changed';
      return output('');
    });
    expect(seen).toEqual(['original:first', 'original:second']);
    expect(report.results.every(item => item.status === 'passed')).toBe(true);
    const execute = vi.fn();
    expect((await runTestCases({ entry: 'missing.srp', files: {} }, cases, new AbortController().signal, execute)).state).toBe('invalid');
    expect(execute).not.toHaveBeenCalled();
  });
});
