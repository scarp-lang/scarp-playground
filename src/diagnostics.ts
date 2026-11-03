import type { CompilerDiagnostic, DiagnosticLocation } from './runner/types';

export type EditorRange = {
  startLineNumber: number;
  startColumn: number;
  endLineNumber: number;
  endColumn: number;
};

/**
 * Scarp schema v1 columns count Unicode scalar values (Rust chars).
 * Monaco uses UTF-16 code units. Astral scalars such as emoji occupy two
 * code units, while combining characters each count as a separate scalar.
 */
export function scalarToUtf16Column(line: string, scalarColumn: number): number {
  if (!Number.isSafeInteger(scalarColumn) || scalarColumn < 1) return 1;
  let result = 1;
  let scalarPosition = 1;
  for (const scalar of line) {
    if (scalarPosition >= scalarColumn) break;
    result += scalar.length;
    scalarPosition += 1;
  }
  return result;
}

/** Convert the compiler's half-open, 1-based source range into Monaco coordinates. */
export function sourceLocationToEditorRange(
  source: string,
  location: DiagnosticLocation,
): EditorRange | null {
  const lines = source.split(/\r?\n/);
  const start = location.start;
  const end = location.end;
  for (const position of [start, end]) {
    if (
      !Number.isSafeInteger(position.line) ||
      !Number.isSafeInteger(position.column) ||
      position.line < 1 ||
      position.line > lines.length ||
      position.column < 1
    ) return null;
  }
  const startColumn = scalarToUtf16Column(lines[start.line - 1], start.column);
  const endColumn = scalarToUtf16Column(lines[end.line - 1], end.column);
  if (end.line < start.line || (end.line === start.line && endColumn < startColumn)) {
    return null;
  }
  return {
    startLineNumber: start.line,
    startColumn,
    endLineNumber: end.line,
    endColumn,
  };
}

export function hasSupportedDiagnosticEncoding(diagnostic: CompilerDiagnostic): boolean {
  return diagnostic.schema_version === 1 &&
    diagnostic.span_encoding === 'utf-8-bytes' &&
    diagnostic.column_encoding === 'unicode-scalar' &&
    diagnostic.position_base === 1;
}

/**
 * Markers are added only when the exact file is in the current virtual
 * workspace and the compiler announces the understood schema/encoding.
 */
export function diagnosticLocations(
  diagnostic: CompilerDiagnostic | null | undefined,
): Array<{ location: DiagnosticLocation; message: string; isPrimary: boolean }> {
  if (!diagnostic || !hasSupportedDiagnosticEncoding(diagnostic)) return [];
  const items: Array<{ location: DiagnosticLocation; message: string; isPrimary: boolean }> = [];
  if (diagnostic.primary) {
    items.push({
      location: diagnostic.primary,
      message: (diagnostic.code ? diagnostic.code + ': ' : '') + diagnostic.message +
        (diagnostic.help ? '\nHint: ' + diagnostic.help : ''),
      isPrimary: true,
    });
  }
  for (const related of diagnostic.related ?? []) {
    if (related.location) {
      items.push({ location: related.location, message: related.message, isPrimary: false });
    }
  }
  return items;
}
