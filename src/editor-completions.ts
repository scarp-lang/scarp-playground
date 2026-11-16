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
  { label: 'assert', insertText: 'assert(${1:true}, "${2:reason}");', detail: 'Check a Boolean condition with an optional literal message', kind: 'snippet' },
  { label: 'while', insertText: 'while ${1:true} {\n  $0\n}', detail: 'Conditional loop (subject to interpreter work budget)', kind: 'snippet' },
  { label: 'repeat', insertText: 'repeat ${1:5} as ${2:index} {\n  $0\n}', detail: 'Counted loop', kind: 'snippet' },
  { label: 'funcra', insertText: 'funcra ${1:identity}(${2:value}: integer) -> integer {\n  return ${2:value};\n}', detail: 'Typed function declaration', kind: 'snippet' },
  { label: 'pure funcra', insertText: 'pure funcra ${1:identity}(${2:value}: integer) -> integer {\n  return ${2:value};\n}', detail: 'Pure typed function declaration', kind: 'snippet' },
  { label: 'import', insertText: 'import "${1:lib/math.srp}" as ${2:math};', detail: 'Import another local .srp source', kind: 'snippet' },
  { label: 'read_line', insertText: 'read_line()', detail: 'Read one line of explicitly supplied stdin', kind: 'snippet' },
  { label: 'read_line_or', insertText: 'read_line_or("${1:Guest}")', detail: 'Read or default at EOF (alpha.10)', kind: 'snippet' },
  { label: 'try_read_line', insertText: 'try_read_line()', detail: 'Return (has_line, text): empty line differs from EOF', kind: 'snippet' },
  { label: 'array literal', insertText: '[array: ${1:10}, ${2:20}]', detail: 'Immutable fixed-size array literal (alpha.10)', kind: 'snippet' },
  { label: 'array type', insertText: 'array<${1:integer}, ${2:2}>', detail: 'Fixed-size array type annotation (alpha.10)', kind: 'snippet' },
  { label: 'tuple', insertText: 'tuple<${1:integer}, ${2:string}>', detail: 'Structural tuple type annotation', kind: 'snippet' },
  { label: 'text_trim', insertText: 'text_trim(${1:text})', detail: 'Remove surrounding Unicode whitespace', kind: 'snippet' },
  { label: 'text_replace', insertText: 'text_replace(${1:text}, ${2:pattern}, ${3:replacement})', detail: 'Replace literal text matches', kind: 'snippet' },
  { label: 'text_to_integer', insertText: 'text_to_integer(${1:text})', detail: 'Parse checked i64 decimal', kind: 'snippet' },
  { label: 'text_to_float', insertText: 'text_to_float(${1:text})', detail: 'Parse finite binary64 decimal', kind: 'snippet' },
  { label: 'integer_to_text', insertText: 'integer_to_text(${1:value})', detail: 'Format an integer as text', kind: 'snippet' },
  { label: "decimal", insertText: "decimal(\"${1:199.99}\")", detail: "Parse exact base-10 decimal (alpha.11)", kind: 'snippet' },
  { label: "decimal_from_integer", insertText: "decimal_from_integer(${1:value})", detail: "Exact integer to decimal", kind: 'snippet' },
  { label: "decimal_to_integer", insertText: "decimal_to_integer(${1:value})", detail: "Checked whole decimal to integer", kind: 'snippet' },
  { label: "decimal_to_text", insertText: "decimal_to_text(${1:value})", detail: "Canonical decimal text", kind: 'snippet' },
  { label: "decimal_abs", insertText: "decimal_abs(${1:value})", detail: "Absolute decimal", kind: 'snippet' },
  { label: "decimal_round", insertText: "decimal_round(${1:value}, ${2:2}, \"${3:half_even}\")", detail: "Round explicitly to a maximum scale", kind: 'snippet' },
  { label: "decimal_format", insertText: "decimal_format(${1:value}, ${2:2}, \"${3:half_even}\")", detail: "Format exactly N places", kind: 'snippet' },
  { label: "decimal_div_rounded", insertText: "decimal_div_rounded(${1:a}, ${2:b}, ${3:2}, \"${4:half_even}\")", detail: "Rounded decimal division", kind: 'snippet' },
  // This static syntax is supported by the published compiler alpha.12.
  { label: "record declaration", insertText: "record ${1:Task} {\\n  title: string,\\n  done: boolean,\\n}", detail: "Nominal record fields (alpha.12)", kind: 'snippet' },
  { label: "variant declaration", insertText: "variant ${1:Action} {\\n  Add(string),\\n  Complete(string),\\n}", detail: "Tagged variants (alpha.12)", kind: 'snippet' },
  { label: "new record", insertText: "new ${1:Task} { title: ${2:\"Draft\"}, done: ${3:false} }", detail: "Construct typed record value (alpha.12)", kind: 'snippet' },
  { label: "match on", insertText: "match on ${1:result} {\\n  case Ok(${2:value}) {\\n    $0\\n  }\\n  case Err(${3:message}) {\\n  }\\n}", detail: "Exhaustive tagged match for Result<T,E> (alpha.12)", kind: 'snippet' },
  { label: "destructure tuple", insertText: "bind (${1:first}, ${2:second}) = ${3:pair};", detail: "Destructure tuple binding (alpha.12)", kind: 'snippet' },
  { label: "list literal", insertText: "[list: ${1:1}, ${2:2}]", detail: "Immutable typed list literal (alpha.12)", kind: 'snippet' },
  { label: "list type", insertText: "list<${1:integer}>", detail: "Immutable list type (alpha.12)", kind: 'snippet' },
  { label: "map literal", insertText: "[map: \"${1:a}\": ${2:1}]", detail: "Canonical sorted immutable map (alpha.12)", kind: 'snippet' },
  { label: "map type", insertText: "map<${1:string}, ${2:integer}>", detail: "Typed ordered map (alpha.12)", kind: 'snippet' },
  { label: "option type", insertText: "option<${1:string}>", detail: "Checked optional value type (alpha.12)", kind: 'snippet' },
  { label: "result type", insertText: "result<${1:integer}, ${2:string}>", detail: "Checked Result<T,E> type (alpha.12)", kind: 'snippet' },
  { label: "option Some", insertText: "new option<${1:string}>::Some(${2:\"value\"})", detail: "Construct Option Some (alpha.12)", kind: 'snippet' },
  { label: "option None", insertText: "new option<${1:string}>::None()", detail: "Construct Option None (alpha.12)", kind: 'snippet' },
  { label: "result Ok", insertText: "new result<${1:integer}, ${2:string}>::Ok(${3:42})", detail: "Construct successful Result (alpha.12)", kind: 'snippet' },
  { label: "result Err", insertText: "new result<${1:integer}, ${2:string}>::Err(${3:\"failed\"})", detail: "Construct error Result (alpha.12)", kind: 'snippet' },
  { label: "list_len", insertText: "list_len(${1:items})", detail: "Get typed list length (alpha.12)", kind: 'snippet' },
  { label: "list_push", insertText: "list_push(${1:items}, ${2:value})", detail: "Return a new list with an appended item (alpha.12)", kind: 'snippet' },
  { label: "list_set", insertText: "list_set(${1:items}, ${2:index}, ${3:value})", detail: "Return a list with one element replaced (alpha.12)", kind: 'snippet' },
  { label: "list_remove", insertText: "list_remove(${1:items}, ${2:index})", detail: "Return a list without the selected element (alpha.12)", kind: 'snippet' },
  { label: "map_len", insertText: "map_len(${1:items})", detail: "Get typed map length (alpha.12)", kind: 'snippet' },
  { label: "map_contains", insertText: "map_contains(${1:items}, ${2:key})", detail: "Check a typed map key (alpha.12)", kind: 'snippet' },
  { label: "map_get_or", insertText: "map_get_or(${1:items}, ${2:key}, ${3:fallback})", detail: "Read a key or provide a typed fallback (alpha.12)", kind: 'snippet' },
  { label: "map_set", insertText: "map_set(${1:items}, ${2:key}, ${3:value})", detail: "Return a new map with one updated entry (alpha.12)", kind: 'snippet' },
  { label: "map_remove", insertText: "map_remove(${1:items}, ${2:key})", detail: "Return a new map without the selected key (alpha.12)", kind: 'snippet' },
  { label: "map_keys", insertText: "map_keys(${1:items})", detail: "Return canonically sorted map keys (alpha.12)", kind: 'snippet' },
  { label: "map_values", insertText: "map_values(${1:items})", detail: "Return map values in canonical key order (alpha.12)", kind: 'snippet' },
  { label: 'bigint', insertText: 'bigint("${1:12345678901234567890}")', detail: 'Parse a bounded exact decimal integer (alpha.9)', kind: 'snippet' },
  { label: 'bigint_from_integer', insertText: 'bigint_from_integer(${1:value})', detail: 'Convert signed i64 to exact bigint', kind: 'snippet' },
  { label: 'bigint_to_integer', insertText: 'bigint_to_integer(${1:value})', detail: 'Checked bigint to signed i64 conversion', kind: 'snippet' },
  { label: 'bigint_abs', insertText: 'bigint_abs(${1:value})', detail: 'Exact nonnegative bigint magnitude', kind: 'snippet' },
  { label: 'bigint_divmod', insertText: 'bigint_divmod(${1:a}, ${2:b})', detail: 'Exact quotient/remainder tuple (alpha.10)', kind: 'snippet' },
  { label: 'bigint_pow', insertText: 'bigint_pow(${1:value}, ${2:exponent})', detail: 'Exact power with integer exponent (alpha.10)', kind: 'snippet' },
  { label: 'bigint_pow_mod', insertText: 'bigint_pow_mod(${1:value}, ${2:exponent}, ${3:modulus})', detail: 'Bounded variable-time modular exponentiation (alpha.10)', kind: 'snippet' },
  { label: 'bigint_gcd', insertText: 'bigint_gcd(${1:a}, ${2:b})', detail: 'Exact greatest common divisor (alpha.10)', kind: 'snippet' },
  { label: 'bigint_lcm', insertText: 'bigint_lcm(${1:a}, ${2:b})', detail: 'Exact least common multiple (alpha.10)', kind: 'snippet' },
  { label: 'bigint_sqrt', insertText: 'bigint_sqrt(${1:value})', detail: 'Floor square root (alpha.10)', kind: 'snippet' },
  { label: 'bigint_bit_length', insertText: 'bigint_bit_length(${1:value})', detail: 'Magnitude bit length (alpha.10)', kind: 'snippet' },
  { label: 'bigint_from_radix', insertText: 'bigint_from_radix("${1:ff}", ${2:16})', detail: 'Parse signed base 2–36 (alpha.10)', kind: 'snippet' },
  { label: 'bigint_to_radix', insertText: 'bigint_to_radix(${1:value}, ${2:16})', detail: 'Format BigInt in base 2–36 (alpha.10)', kind: 'snippet' },
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
