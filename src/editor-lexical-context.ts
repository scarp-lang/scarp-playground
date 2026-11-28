// Lightweight lexical context for suggestions, not a replacement for the compiler.
// Raw and triple-quoted strings do not interpret backslash escapes.
export type CompletionContext = 'code' | 'comment' | 'string' | 'raw' | 'multiline';

export function completionContext(source: string): CompletionContext {
  let state: CompletionContext = 'code';
  for (let i = 0; i < source.length;) {
    const c = source[i];
    if (state === 'multiline') {
      if (source.startsWith('"""', i)) { state = 'code'; i += 3; }
      else i++;
      continue;
    }
    if (c === '\n' || c === '\r') {
      state = 'code';
      i++;
      continue;
    }
    if (state === 'comment') { i++; continue; }
    if (state === 'raw' || state === 'string') {
      if (state === 'string' && c === '\\' && i + 1 < source.length &&
          source[i + 1] !== '\r' && source[i + 1] !== '\n') {
        i += 2;
        continue;
      }
      if (c === '"') state = 'code';
      i++;
      continue;
    }
    if (source.startsWith('//', i)) { state = 'comment'; i += 2; }
    else if (source.startsWith('"""', i)) { state = 'multiline'; i += 3; }
    else if (source.startsWith('r"', i)) { state = 'raw'; i += 2; }
    else if (c === '"') { state = 'string'; i++; }
    else if (/[A-Za-z_0-9]/.test(c)) {
      // Do not misread the final r of an identifier as a raw-string prefix.
      do { i++; } while (i < source.length && /[A-Za-z_0-9]/.test(source[i]));
    } else i++;
  }
  return state;
}
