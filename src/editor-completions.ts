import { validPath } from './workspace';

export type CompletionHint = {
  label: string;
  insertText: string;
  detail: string;
  kind: 'snippet' | 'file';
  replaceLength: number;
};

// Static, release-verified syntax only. These are NOT inferred user symbols,
// type-checking results or compiler-backed semantic completions.
const SNIPPETS: ReadonlyArray<Omit<CompletionHint, 'replaceLength'>> = [
  { label: 'bind', insertText: 'bind ${1:value} = ${2:0};', detail: 'Declare an immutable binding', kind: 'snippet' },
  { label: 'var', insertText: 'var ${1:counter} = ${2:0};', detail: 'Declare a mutable binding', kind: 'snippet' },
  { label: 'if', insertText: 'if ${1:true} {\n  $0\n}', detail: 'Conditional block', kind: 'snippet' },
  { label: 'while', insertText: 'while ${1:true} {\n  $0\n}', detail: 'Conditional loop (subject to interpreter work budget)', kind: 'snippet' },
  { label: 'repeat', insertText: 'repeat ${1:5} as ${2:index} {\n  $0\n}', detail: 'Counted loop', kind: 'snippet' },
  { label: 'funcra', insertText: 'funcra ${1:identity}(${2:value}: integer) -> integer {\n  return ${2:value};\n}', detail: 'Typed function declaration', kind: 'snippet' },
  { label: 'pure funcra', insertText: 'pure funcra ${1:identity}(${2:value}: integer) -> integer {\n  return ${2:value};\n}', detail: 'Pure typed function declaration', kind: 'snippet' },
  { label: 'import', insertText: 'import "${1:lib/math.srp}" as ${2:math};', detail: 'Import another local .srp source', kind: 'snippet' },
  { label: 'read_line', insertText: 'read_line()', detail: 'Read one line of explicitly supplied stdin', kind: 'snippet' },
  { label: 'tuple', insertText: 'tuple<${1:integer}, ${2:string}>', detail: 'Structural tuple type annotation', kind: 'snippet' },
  { label: 'text_trim', insertText: 'text_trim(${1:text})', detail: 'Remove surrounding Unicode whitespace', kind: 'snippet' },
  { label: 'text_replace', insertText: 'text_replace(${1:text}, ${2:pattern}, ${3:replacement})', detail: 'Replace literal text matches', kind: 'snippet' },
  { label: 'text_to_integer', insertText: 'text_to_integer(${1:text})', detail: 'Parse checked i64 decimal', kind: 'snippet' },
  { label: 'text_to_float', insertText: 'text_to_float(${1:text})', detail: 'Parse finite binary64 decimal', kind: 'snippet' },
  { label: 'integer_to_text', insertText: 'integer_to_text(${1:value})', detail: 'Format an integer as text', kind: 'snippet' },
  { label: 'float_to_text', insertText: 'float_to_text(${1:value})', detail: 'Format finite float as text', kind: 'snippet' },
  { label: 'print', insertText: 'print(${1:value});', detail: 'Print values and a newline', kind: 'snippet' },
  { label: 'println', insertText: 'println(${1:value});', detail: 'Print values and a newline', kind: 'snippet' },
  { label: 'write', insertText: 'write(${1:value});', detail: 'Write output without a final newline', kind: 'snippet' },
  { label: 'eprint', insertText: 'eprint(${1:value});', detail: 'Print values to stderr', kind: 'snippet' },
  { label: 'ewrite', insertText: 'ewrite(${1:value});', detail: 'Write to stderr without a newline', kind: 'snippet' },
];

// A shared platform-neutral path is resolved relative to the importing file.
// The compiler's in-memory module loader is responsible for final validation.
export function relativeImportPath(importer: string, target: string): string {
  const from = importer.split('/').slice(0, -1);
  const to = target.split('/');
  let common = 0;
  while (common < from.length && common < to.length && from[common] === to[common]) common++;
  return [...from.slice(common).map(() => '..'), ...to.slice(common)].join('/');
}

function insideCommentOrString(prefix: string): boolean {
  let quoted = false;
  let escape = false;
  for (let index = 0; index < prefix.length; index++) {
    const char = prefix[index];
    if (quoted) {
      if (escape) escape = false;
      else if (char === '\\') escape = true;
      else if (char === '"') quoted = false;
    } else if (char === '"') {
      quoted = true;
    } else if (char === '/' && prefix[index + 1] === '/') {
      return true;
    }
  }
  return quoted;
}

/** Pure editor hints: never execute source or synthesize unknown identifiers. */
export function editorCompletionHints(
  linePrefix: string,
  currentFile: string,
  files: Record<string, string>,
): CompletionHint[] {
  const importString = /^\s*import\s+"([^"\r\n]*)$/.exec(linePrefix);
  if (importString && validPath(currentFile)) {
    const typed = importString[1];
    return Object.keys(files)
      .filter((file) => file !== currentFile && validPath(file))
      .map((file) => relativeImportPath(currentFile, file))
      .filter((path) => path.startsWith(typed))
      .sort()
      .map((path) => ({
        label: path,
        insertText: path,
        detail: 'Local project module',
        kind: 'file' as const,
        replaceLength: typed.length,
      }));
  }
  if (insideCommentOrString(linePrefix)) return [];
  const word = /[A-Za-z_][A-Za-z0-9_]*$/.exec(linePrefix)?.[0] ?? '';
  return SNIPPETS.filter((hint) => hint.label.startsWith(word))
    .map((hint) => ({ ...hint, replaceLength: word.length }));
}
