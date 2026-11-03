import { describe, expect, it } from 'vitest';
import {
  diagnosticLocations,
  hasSupportedDiagnosticEncoding,
  scalarToUtf16Column,
  sourceLocationToEditorRange,
} from '../src/diagnostics';
import type { CompilerDiagnostic } from '../src/runner/types';

const diagnostic: CompilerDiagnostic = {
  schema_version: 1,
  severity: 'error',
  code: 'E0010',
  message: 'unknown name',
  span_encoding: 'utf-8-bytes',
  column_encoding: 'unicode-scalar',
  position_base: 1,
  primary: {
    path: 'math.srp',
    span: [20, 25],
    start: { line: 2, column: 11 },
    end: { line: 2, column: 16 },
  },
  related: [{
    message: 'related declaration',
    location: {
      path: 'main.srp',
      span: [0, 5],
      start: { line: 1, column: 1 },
      end: { line: 1, column: 6 },
    },
  }],
  help: 'declare it first',
};

describe('compiler schema-v1 diagnostic coordinates', () => {
  it('maps Unicode scalar columns to Monaco UTF-16 columns', () => {
    expect(scalarToUtf16Column('a😀b', 1)).toBe(1);
    expect(scalarToUtf16Column('a😀b', 2)).toBe(2);
    expect(scalarToUtf16Column('a😀b', 3)).toBe(4);
    expect(scalarToUtf16Column('a😀b', 4)).toBe(5);
    expect(scalarToUtf16Column('e\u0301x', 3)).toBe(3);
    expect(scalarToUtf16Column('a😀b', 200)).toBe(5);
  });

  it('maps ranges after astral code points and preserves half-open endpoints', () => {
    expect(sourceLocationToEditorRange('print("😀");\nprint(missing);', {
      path: 'main.srp',
      start: { line: 2, column: 7 },
      end: { line: 2, column: 14 },
    })).toEqual({
      startLineNumber: 2,
      startColumn: 7,
      endLineNumber: 2,
      endColumn: 14,
    });
    expect(sourceLocationToEditorRange('😀unknown', {
      path: 'main.srp',
      start: { line: 1, column: 2 },
      end: { line: 1, column: 9 },
    })).toEqual({
      startLineNumber: 1,
      startColumn: 3,
      endLineNumber: 1,
      endColumn: 10,
    });
  });

  it('handles CRLF lines, empty EOF spans, and rejects invalid positions', () => {
    expect(sourceLocationToEditorRange('hello\r\n😀x\r\n', {
      path: 'main.srp',
      start: { line: 2, column: 1 },
      end: { line: 2, column: 2 },
    })).toEqual({
      startLineNumber: 2,
      startColumn: 1,
      endLineNumber: 2,
      endColumn: 3,
    });
    expect(sourceLocationToEditorRange('hello\n', {
      path: 'main.srp',
      start: { line: 2, column: 1 },
      end: { line: 2, column: 1 },
    })).toEqual({
      startLineNumber: 2,
      startColumn: 1,
      endLineNumber: 2,
      endColumn: 1,
    });
    expect(sourceLocationToEditorRange('abc', {
      path: 'main.srp',
      start: { line: 3, column: 1 },
      end: { line: 3, column: 2 },
    })).toBeNull();
  });

  it('accepts only the exact documented compiler encoding', () => {
    expect(hasSupportedDiagnosticEncoding(diagnostic)).toBe(true);
    expect(hasSupportedDiagnosticEncoding({ ...diagnostic, column_encoding: 'utf-16' })).toBe(false);
    expect(hasSupportedDiagnosticEncoding({ ...diagnostic, schema_version: 2 })).toBe(false);
    expect(diagnosticLocations({ ...diagnostic, span_encoding: undefined })).toEqual([]);
  });

  it('retains the primary and file-specific related locations', () => {
    const items = diagnosticLocations(diagnostic);
    expect(items).toHaveLength(2);
    expect(items[0].location.path).toBe('math.srp');
    expect(items[0].message).toContain('E0010');
    expect(items[0].message).toContain('declare it first');
    expect(items[1].location.path).toBe('main.srp');
    expect(items[1].isPrimary).toBe(false);
  });
});
