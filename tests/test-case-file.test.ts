import { describe, expect, it } from 'vitest';
import { decodeTestCaseFile, MAX_TEST_CASE_FILE_BYTES, parseTestCaseFile, serializeTestCaseFile,
  TEST_CASE_FILE_FORMAT, TEST_CASE_FILE_VERSION } from '../src/runner/test-case-file';
import { newTestCase, type TestCase } from '../src/runner/test-cases';

const cases: TestCase[] = [
  { name: 'Unicode', stdin: 'नमस्ते\r\n😀\n', allowPrompts: true,
    expected: { kind: 'output', stdout: 'नमस्ते\r\n😀\n', stderr: '\u0000warning' } },
  { name: 'Error', stdin: '', allowPrompts: false, expected: { kind: 'diagnostic', code: 'E0085' } },
];

describe('portable test definitions', () => {
  it('round-trips exact input and output without including unknown fields or source', () => {
    const withExtra = cases.map(item => ({ ...item, workspace: { files: {} }, output: 'not included' }));
    const encoded = serializeTestCaseFile(withExtra);
    expect(encoded.ok).toBe(true);
    if (!encoded.ok) return;
    const data = JSON.parse(encoded.text);
    expect(Object.keys(data)).toEqual(['format', 'version', 'cases']);
    expect(data.format).toBe(TEST_CASE_FILE_FORMAT);
    expect(data.version).toBe(TEST_CASE_FILE_VERSION);
    expect(data.cases).toEqual(cases);
    expect(parseTestCaseFile(encoded.text)).toEqual({ ok: true, cases });
    expect(decodeTestCaseFile(new TextEncoder().encode('\ufeff' + encoded.text))).toEqual({ ok: true, cases });
  });

  it('rejects malformed JSON, unknown versions, wrong formats and bad UTF-8', () => {
    for (const raw of ['', 'null', '[]', '{', JSON.stringify({ format: TEST_CASE_FILE_FORMAT, version: 2, cases }),
      JSON.stringify({ format: 'scarp-playground-workspace', version: 1, cases }),
      JSON.stringify({ format: TEST_CASE_FILE_FORMAT, version: 1, cases: [{ name: 'x' }] })]) {
      expect(parseTestCaseFile(raw).ok).toBe(false);
    }
    expect(decodeTestCaseFile(Uint8Array.of(0xc3, 0x28)).ok).toBe(false);
  });

  it('checks raw byte limits independently of the case-text budget', () => {
    expect(parseTestCaseFile('x'.repeat(MAX_TEST_CASE_FILE_BYTES + 1)).ok).toBe(false);
    expect(parseTestCaseFile('😀'.repeat(MAX_TEST_CASE_FILE_BYTES / 4 + 1)).ok).toBe(false);
    expect(decodeTestCaseFile(new Uint8Array(MAX_TEST_CASE_FILE_BYTES + 1)).ok).toBe(false);
    expect(serializeTestCaseFile([newTestCase('same'), newTestCase('same')]).ok).toBe(false);
  });

  it('supports heavily escaped legal input up to per-case limits', () => {
    const control = '\u0001'.repeat(16 * 1024);
    const full: TestCase[] = [
      { name: 'one', stdin: control, allowPrompts: false, expected: { kind: 'output', stdout: control, stderr: control } },
      { name: 'two', stdin: control, allowPrompts: true, expected: { kind: 'output', stdout: control, stderr: control } },
    ];
    const result = serializeTestCaseFile(full);
    expect(result.ok).toBe(true);
    if (result.ok) expect(parseTestCaseFile(result.text)).toEqual({ ok: true, cases: full });
  });

  it('does not mistake extra source or result fields for executable definitions', () => {
    const raw = JSON.stringify({ format: TEST_CASE_FILE_FORMAT, version: 1,
      cases: [{ ...cases[0], source: 'print(0);', expected: { ...cases[0].expected, actual: 'ignored' } }],
      source: 'print(1);', autoRun: true });
    expect(parseTestCaseFile(raw)).toEqual({ ok: true, cases: [cases[0]] });
  });
});
