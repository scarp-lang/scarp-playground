import { MAX_SUITE_TEXT_BYTES, validateTestCases, type TestCase } from './test-cases';

export const TEST_CASE_FILE_FORMAT = 'scarp-playground-test-cases';
export const TEST_CASE_FILE_VERSION = 1;
// JSON can escape ASCII control characters to six code units each. Allow
// the complete valid case-text budget plus bounded metadata overhead.
export const MAX_TEST_CASE_FILE_BYTES = 6 * MAX_SUITE_TEXT_BYTES + 4096;

type FileResult = { ok: true; cases: TestCase[] } | { ok: false; error: string };
type SerializeResult = { ok: true; text: string } | { ok: false; error: string };

const encoder = new TextEncoder();
const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Only projected test definitions, never workspace source or results. */
export function serializeTestCaseFile(input: unknown): SerializeResult {
  const validated = validateTestCases(input);
  if (!validated.ok) return validated;
  const text = JSON.stringify({
    format: TEST_CASE_FILE_FORMAT,
    version: TEST_CASE_FILE_VERSION,
    cases: validated.cases,
  }, null, 2) + '\n';
  if (encoder.encode(text).byteLength > MAX_TEST_CASE_FILE_BYTES) {
    return { ok: false, error: 'Test case file exceeds its serialized size limit.' };
  }
  return { ok: true, text };
}

/** Reject unknown schema versions and oversize data before parsing. */
export function parseTestCaseFile(raw: string): FileResult {
  if (typeof raw !== 'string' || raw.length > MAX_TEST_CASE_FILE_BYTES ||
      encoder.encode(raw).byteLength > MAX_TEST_CASE_FILE_BYTES) {
    return { ok: false, error: 'The test case file exceeds its serialized size limit.' };
  }
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return { ok: false, error: 'The selected test case file is not valid JSON.' };
  }
  if (!record(value) || value.format !== TEST_CASE_FILE_FORMAT || value.version !== TEST_CASE_FILE_VERSION) {
    return { ok: false, error: 'Unsupported test case file format or version.' };
  }
  return validateTestCases(value.cases);
}

/** Read explicit local bytes as strict UTF-8, stripping an optional BOM. */
export function decodeTestCaseFile(bytes: Uint8Array): FileResult {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength > MAX_TEST_CASE_FILE_BYTES) {
    return { ok: false, error: 'The test case file exceeds its serialized size limit.' };
  }
  try {
    return parseTestCaseFile(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch {
    return { ok: false, error: 'The selected test case file is not valid UTF-8.' };
  }
}
