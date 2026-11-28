export const OUTPUT_CONTEXT_SCALARS = 24;
export type OutputStream = 'stdout' | 'stderr';

export type OutputContext = {
  before: string;
  scalar: string | null;
  after: string;
  omittedBefore: boolean;
  omittedAfter: boolean;
};
export type OutputDifference = {
  stream: OutputStream;
  offset: number;
  line: number;
  column: number;
  expectedUnits: number;
  actualUnits: number;
  expectedBytes: number;
  actualBytes: number;
  expected: OutputContext;
  actual: OutputContext;
};

function nextScalar(source: string, offset: number): string | null {
  const cp = source.codePointAt(offset);
  return cp === undefined ? null : String.fromCodePoint(cp);
}

function previousOffset(source: string, offset: number): number {
  if (offset <= 0) return 0;
  const low = source.charCodeAt(offset - 1), high = source.charCodeAt(offset - 2);
  return offset >= 2 && low >= 0xdc00 && low <= 0xdfff && high >= 0xd800 && high <= 0xdbff ? offset - 2 : offset - 1;
}

function context(source: string, offset: number): OutputContext {
  let start = offset;
  for (let i = 0; i < OUTPUT_CONTEXT_SCALARS && start > 0; i++) start = previousOffset(source, start);
  const scalar = nextScalar(source, offset);
  const from = offset + (scalar?.length ?? 0);
  let end = from;
  for (let i = 0; i < OUTPUT_CONTEXT_SCALARS && end < source.length; i++) end += nextScalar(source, end)?.length ?? 1;
  return { before: source.slice(start, offset), scalar, after: source.slice(from, end),
    omittedBefore: start > 0, omittedAfter: end < source.length };
}

/** Compare exact Unicode scalars and retain only a bounded local window.
 * No normalization, whitespace folding, or newline conversion. The offset
 * is UTF-16, while line/column use 1-based Unicode scalar coordinates. */
export function describeOutputDifference(stream: OutputStream, expected: string, actual: string): OutputDifference | null {
  if (expected === actual) return null;
  let offset = 0, line = 1, column = 1;
  let previousCR = false;
  for (;;) {
    const a = nextScalar(expected, offset), b = nextScalar(actual, offset);
    if (a !== b || a === null) break;
    if (a === '\r') { line++; column = 1; }
    else if (a === '\n') { if (!previousCR) line++; column = 1; }
    else column++;
    previousCR = a === '\r';
    offset += a.length;
  }
  const encoder = new TextEncoder();
  return { stream, offset, line, column, expectedUnits: expected.length, actualUnits: actual.length,
    expectedBytes: encoder.encode(expected).length, actualBytes: encoder.encode(actual).length,
    expected: context(expected, offset), actual: context(actual, offset) };
}

/** Render visible control and spacing characters without interpreting them. */
export function visibleOutput(value: string): string {
  return [...value].map(char => {
    switch (char) {
      case ' ': return '␠';
      case '\t': return '\\t';
      case '\r': return '\\r';
      case '\n': return '\\n';
      case '\\': return '\\\\';
      default: {
        const cp = char.codePointAt(0)!;
        return cp < 32 || (cp >= 127 && cp <= 159) || cp === 0x2028 || cp === 0x2029 ||
          (cp >= 0x200b && cp <= 0x200f) || (cp >= 0x202a && cp <= 0x202e) ||
          (cp >= 0x2060 && cp <= 0x206f) || cp === 0xfeff ? '\\u{' + cp.toString(16).toUpperCase() + '}' : char;
      }
    }
  }).join('');
}

export function scalarLabel(value: string | null): string {
  if (value === null) return 'end of output';
  const code = value.codePointAt(0)!.toString(16).toUpperCase().padStart(4, '0');
  return visibleOutput(value) + ' (U+' + code + ')';
}
