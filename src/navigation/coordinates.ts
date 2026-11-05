/**
 * Monaco uses UTF-16 code-unit columns. Scarp's index accepts file-local UTF-8
 * byte offsets; invalid mid-surrogate positions must not be silently rounded.
 * CRLF is treated as one line break, preserving the original byte offset.
 */
export function editorPositionToByteOffset(
  source: string, line: number, column: number,
): number | null {
  if (!Number.isSafeInteger(line) || line < 1 ||
      !Number.isSafeInteger(column) || column < 1) return null;
  const matches = [...source.matchAll(/\r\n|\r|\n/g)];
  const from = line === 1 ? 0 : matches[line - 2]?.index === undefined
    ? null : matches[line - 2].index! + matches[line - 2][0].length;
  if (from === null || line > matches.length + 1) return null;
  const to = matches[line - 1]?.index ?? source.length;
  const text = source.slice(from, to);
  const units = column - 1;
  if (units > text.length) return null;
  if (units > 0 && units < text.length &&
      /[\uD800-\uDBFF]/.test(text[units - 1]) &&
      /[\uDC00-\uDFFF]/.test(text[units])) return null;
  return new TextEncoder().encode(source.slice(0, from + units)).byteLength;
}
