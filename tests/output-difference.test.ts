import { describe, expect, it } from 'vitest';
import { describeOutputDifference, OUTPUT_CONTEXT_SCALARS, scalarLabel, visibleOutput } from '../src/runner/output-difference';
import { runTestCases, newTestCase } from '../src/runner/test-cases';

describe('exact output comparison windows', () => {
  it('does not invent differences in equal Unicode output', () => {
    expect(describeOutputDifference('stdout', 'नमस्ते 😀\r\n', 'नमस्ते 😀\r\n')).toBeNull();
  });
  it('keeps whole Unicode scalars and CRLF-aware positions', () => {
    const diff = describeOutputDifference('stdout', 'a\r\n😀x', 'a\r\n😁x')!;
    expect(diff).toMatchObject({ stream: 'stdout', offset: 3, line: 2, column: 1,
      expected: { scalar: '😀', before: 'a\r\n', after: 'x' },
      actual: { scalar: '😁', before: 'a\r\n', after: 'x' } });
    const second = describeOutputDifference('stderr', '😀\r\néa', '😀\r\néb')!;
    expect(second).toMatchObject({ offset: 5, line: 2, column: 2 });
  });
  it('distinguishes final newline, spaces, tabs and end of output', () => {
    const diff = describeOutputDifference('stdout', 'x\n', 'x')!;
    expect(diff.expected.scalar).toBe('\n');
    expect(diff.actual.scalar).toBeNull();
    expect(scalarLabel(null)).toBe('end of output');
    expect(scalarLabel('\t')).toBe('\\t (U+0009)');
    expect(visibleOutput(' \t\r\n\u0000\u202e')).toBe('␠\\t\\r\\n\\u{0}\\u{202E}');
  });
  it('retains bounded context even if the mismatch is outside captured prefix', () => {
    const prefix = '😀'.repeat(6000), suffix = 'x'.repeat(1000);
    const diff = describeOutputDifference('stdout', prefix + 'A' + suffix, prefix + 'B' + suffix)!;
    expect(diff.offset).toBe(12000);
    expect(diff.expected.before).toBe('😀'.repeat(OUTPUT_CONTEXT_SCALARS));
    expect(diff.expected.after).toBe('x'.repeat(OUTPUT_CONTEXT_SCALARS));
    expect(diff.expected.omittedBefore).toBe(true);
    expect(diff.expected.omittedAfter).toBe(true);
  });
  it('attaches both stream differences and detaches progress callback data', async () => {
    const test = { ...newTestCase(), expected: { kind: 'output' as const, stdout: 'a', stderr: 'b' } };
    const report = await runTestCases({ entry: 'main.srp', files: { 'main.srp': 'print(1);' } }, [test],
      new AbortController().signal, async () => ({ ok: true, stdout: 'A', stderr: 'B' }), progress => {
        progress[0].differences![0].expected.scalar = 'mutated';
      });
    expect(report.results[0].differences?.map(item => [item.stream, item.expected.scalar, item.actual.scalar]))
      .toEqual([['stdout', 'a', 'A'], ['stderr', 'b', 'B']]);
  });
});
