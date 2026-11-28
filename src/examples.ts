import { defaultExample } from './default-example';

export type Example = {
  title: string;
  description: string;
  entry: string;
  files: Record<string, string>;
  // Ephemeral fixture input: never becomes part of a shareable source workspace.
  stdin?: string;
  // Ephemeral Run setting: never include in shared source or saved projects.
  allowPrompts?: boolean;
};

export const examples: Example[] = [
  defaultExample,
  {
    title: 'Bindings & arithmetic',
    description: 'Immutable values and expressions',
    entry: 'main.srp',
    files: {
      'main.srp': 'bind width = 6;\nbind height = 7;\nbind area = width * height;\nprint("Area:");\nprint(area);\n',
    },
  },
  {
    title: 'If / elif / else',
    description: 'Choose a branch using boolean conditions',
    entry: 'main.srp',
    files: {
      // Source copied from the official compiler fixture examples/decisions.srp.
      'main.srp': `// Conditions are booleans; each body introduces a lexical scope.
bind score = 73;
var grade = "pending";
if score >= 90 {
    grade = "A";
} elif score >= 60 and score < 90 {
    grade = "B";
} else {
    grade = "C";
}
print(grade);
if true or 1 / 0 == 0 {
    bind message = "Selected safely.";
    print(message);
}
`,
    },
  },
  {
    title: 'While loops',
    description: 'Mutate a counter; use break and continue',
    entry: 'main.srp',
    files: {
      // Source copied from the official compiler fixture examples/loops.srp.
      'main.srp': `// Iteration with nearest-loop control and checked accumulator arithmetic.
var index = 0;
var total = 0;
while index < 10 {
    index += 1;
    if index == 3 { continue; }
    if index > 5 { break; }
    total += index;
}
print(total);
`,
    },
  },
  {
    title: 'Counted repeat',
    description: 'Run a fixed number of iterations',
    entry: 'main.srp',
    files: {
      // Source copied from the official compiler fixture examples/repeat.srp.
      'main.srp': `// The count is saved once; changing count does not shorten this loop.
var count = 5;
var total = 0;
repeat count as index {
    count = 0;
    if index == 2 { continue; }
    total += index;
}
print(total);
print(count);
`,
    },
  },
  {
    title: 'Typed functions',
    description: 'Use funcra, parameters, return and pure',
    entry: 'main.srp',
    files: {
      // Source copied from the official compiler fixture examples/functions.srp.
      'main.srp': `// Typed calls, forward declarations, all primitive parameter types, and unit.
print(add(10, square(5)));

funcra add(a: integer, b: integer) -> integer {
    return a + b;
}

funcra square(value: integer) -> integer {
    return value * value;
}

funcra identity(text: string) -> string {
    return text;
}

funcra greet(name: string) -> unit {
    print("Hello", name);
    return;
}

pure funcra choose(value: integer, enabled: boolean) -> integer {
    if enabled { return value * 2; }
    return value;
}

greet(identity("Scarp"));
print(choose(3, true));
`,
    },
  },
  {
    title: 'Writing output',
    description: 'Compare print, write and newlines',
    entry: 'main.srp',
    files: {
      // Source copied from the official compiler fixture examples/output.srp.
      'main.srp': `// Output without a final newline.
bind name = "Scarp";
write("Hello, ");
print(name, 3, true,);
print();
write("done");
`,
    },
  },
  {
    title: 'Root mean square',
    description: 'Numerical RMS from Scarp alpha.6',
    entry: 'main.srp',
    files: {
      'main.srp': '// Root mean square was introduced in alpha.1 and remains in Scarp alpha.2\nprint(rms([2.0, -2.0]));\n',
    },
  },
  {
    title: 'Top-K score ranking',
    description: 'Deterministic candidate selection from alpha.3',
    entry: 'main.srp',
    files: {
      'main.srp': '// Official Scarp v0.0.6-alpha.3 examples/topk_scores.srp\nbind scores = [1.0, 5.0, 5.0, -2.0, 3.0];\nprint(topk(scores, 3));\nprint(topk_values(scores, 3));\nprint(topk(softmax(scores), 2));\nprint(topk([], 0));\n',
    },
  },
  {
    title: 'Temperature softmax',
    description: 'Finite score probabilities, not random sampling',
    entry: 'main.srp',
    files: {
      'main.srp': '// Official Scarp v0.0.6-alpha.3 examples/temperature_softmax.srp\nprint(softmax_temp([2.0, 2.0], 0.5));\nprint(logsoftmax_temp([5.0], 2.0));\nbind logits = [1.0, 4.0, 4.0, 2.0];\nprint(topk(softmax_temp(logits, 0.5), 3));\n',
    },
  },
  {
    "title": "Sampled calculus",
    "description": "Trapezoidal integration and interval slopes (alpha.4)",
    "entry": "main.srp",
    "files": {
      "main.srp": "// Official Scarp v0.0.6-alpha.4 examples/sampled_calculus.srp\nbind time = [0.0, 1.0, 3.0];\nbind velocity = [0.0, 2.0, 6.0];\nprint(sample_area(time, velocity));\nprint(sample_slopes(time, velocity));\n"
    }
  },
  {
    "title": "Cumulative sampled area",
    "description": "Finite prefix integrals (alpha.4)",
    "entry": "main.srp",
    "files": {
      "main.srp": "// Official Scarp v0.0.6-alpha.4 examples/sample_cumulative_area.srp\nbind time = [0.0, 1.0, 3.0, 4.0];\nbind speed = [0.0, 2.0, 6.0, 8.0];\nprint(sample_cumulative_area(time, speed));\nprint(sample_area(time, speed));\n"
    }
  },
  {
    "title": "Cosine similarity",
    "description": "Finite vector direction comparison (alpha.4)",
    "entry": "main.srp",
    "files": {
      "main.srp": "// Official Scarp v0.0.6-alpha.4 examples/cosine_similarity.srp\nbind direction = [3.0, 4.0];\nprint(cosine_similarity(direction, [6.0, 8.0]));\nprint(cosine_similarity([1.0, 0.0], [0.0, 1.0]));\nprint(cosine_similarity([3.0], [-4.0]));\n"
    }
  },
  {
    title: 'Top-P nucleus ranking',
    description: 'Deterministic probability prefix selection (alpha.5)',
    entry: 'main.srp',
    files: { 'main.srp': "// Deterministic nucleus selection: rank the smallest probability prefix\n// covering the specified cumulative mass without random sampling.\nbind probabilities = [0.5, 0.25, 0.25];\nprint(top_p(probabilities, 0.75));\nprint(top_p_values(probabilities, 0.75));\nprint(top_p(probabilities, 1.0));\n\nbind logits = [1.0, 4.0, 4.0, 2.0];\nprint(top_p(softmax_temp(logits, 0.5), 0.9));\n" },
  },
  {
    title: 'Pearson correlation',
    description: 'Centered linear relationship of paired vectors (alpha.5)',
    entry: 'main.srp',
    files: { 'main.srp': "// Pearson correlation: centered scientific statistics, not cosine similarity.\nbind measurements = [1.0, 2.0, 3.0];\nprint(pearson_correlation(measurements, [10.0, 20.0, 30.0]));\nprint(pearson_correlation(measurements, [30.0, 20.0, 10.0]));\nprint(pearson_correlation([-1.0, 0.0, 1.0], [1.0, -2.0, 1.0]));\n" },
  },
  {
    title: 'Program input',
    description: 'Read lines from explicit UTF-8 stdin (alpha.6)',
    entry: 'main.srp',
    files: {
      'main.srp': '// Official compiler alpha.6 examples/program_input.srp\nbind name: string = read_line();\nprint("Hello", name);\nrepeat 2 as index {\n    print(index, read_line());\n}\n',
    },
    // Exact text from examples/program_input.stdin, including the trailing LF.
    stdin: 'संस्कार\nfirst line\nlast line\n',
  },
  {
    title: 'Tuple values',
    description: 'Typed immutable heterogeneous tuples (alpha.6)',
    entry: 'main.srp',
    files: {
      'main.srp': '// Tuples have fixed member types and literal projection indices.\nbind pair: tuple<integer, string> = (7, "नमस्ते");\nprint(pair);\nprint(pair[0], pair[1]);\nprint((42,), (42));\n',
    },
  },
  {
    title: 'Text conversions',
    description: 'Explicit integer/float parsing and Unicode trim (alpha.6)',
    entry: 'main.srp',
    files: {
      'main.srp': '// Official alpha.6 text foundations: conversions are explicit.\nbind count: integer = text_to_integer(text_trim(" 42 "));\nbind value: float = text_to_float("1.25e2");\nprint(integer_to_text(count), float_to_text(value));\n',
    },
  },
  {
    title: 'Conditional values + Unicode escapes',
    description: 'Choose expression values and decode Unicode scalars (alpha.7)',
    entry: 'main.srp',
    files: {
      // Official v0.0.6-alpha.7 examples/conditional_unicode.srp (exact fixture).
      'main.srp': "bind score = 73;\nbind label = if score >= 90 {\n    \"\\u{1F44B}\"\n} elif score >= 60 {\n    \"\\u{0928}\\u{092E}\\u{0938}\\u{094D}\\u{0924}\\u{0947} \\u{1F44B}\"\n} else {\n    text_repeat(\"unreached\", -1)\n};\nprint(label, if true { 7 } else { 1 / 0 });\n",
    },
  },
  {
    title: 'Boolean assertions',
    description: 'Check typed program invariants (alpha.8)',
    entry: 'main.srp',
    files: {
      'main.srp': "// Official Scarp v0.0.6-alpha.8 examples/assertions.srp\npure funcra nonnegative(value: integer) -> integer {\n    assert(value >= 0, \"value must be nonnegative\");\n    return value;\n}\n\nvar sum = 0;\nrepeat 3 as index {\n    assert(index < 3);\n    sum += nonnegative(index);\n}\nassert(sum == 3, \"sum of 0, 1, 2 is 3\");\nprint(sum);\n",
    },
  },
  {
    title: 'Exact big integers',
    description: 'Bounded exact signed arithmetic beyond i64 (alpha.9)',
    entry: 'main.srp',
    files: { 'main.srp': "// Scarp v0.0.6-alpha.9: published exact BigInt arithmetic example.\nbind a: bigint = bigint(\"999999999999999999999999999999\");\nbind one = bigint_from_integer(1);\nprint(a + one);\nprint(a * bigint(\"123456789\"));\nprint(-a / bigint(\"1000000000000000000\"));\nprint(-a % bigint(\"1000000000000000000\"));\nprint(a > one, bigint_abs(-a) == a, bigint_to_integer(one));\n" },
  },
  {
    title: 'BigInt across modules',
    description: 'Typed exact integers in an imported pure function (alpha.9)',
    entry: 'main.srp',
    files: {
      'main.srp': "import \"modules/bigint_math.srp\" as exact;\nprint(exact.twice(bigint(\"123456789012345678901234567890\")));\n",
      'modules/bigint_math.srp': "// Runtime constructors in exported pure functions, not folded constants.\npub pure funcra twice(n: bigint) -> bigint {\n    return n * bigint_from_integer(2);\n}\n",
    },
  },

  {
    title: 'Fixed-size arrays',
    description: 'Immutable typed arrays, indexing and nesting (alpha.10)',
    entry: 'main.srp',
    files: {
      // Published compiler examples/fixed_arrays.srp.
      'main.srp': `pure funcra labels(values: array<string, 2> = [array: "नमस्ते", "Scarp"])
    -> array<string, 2> ensures result == values; {
    return values;
}
var index = 1;
bind grid = [array: [array: 1, 2], [array: 3, 4]];
bind empty = [array: <array<integer, 2>>];
print(labels()[index], grid[index][0], empty);
print(labels(), grid[0] == [array: 1, 2]);
`,
    },
  },
  {
    title: 'Advanced BigInt',
    description: 'Exact divmod, powers, radix and GCD (alpha.10)',
    entry: 'main.srp',
    files: {
      // Published compiler examples/bigint_exact.srp.
      'main.srp': `bind amount = bigint("1000000000000000000000000000007");
bind parts = bigint_divmod(amount, bigint("9"));
print(parts[0], parts[1]);

bind width = bigint_pow(bigint("2"), 128);
print(bigint_bit_length(width), bigint_to_radix(width, 16));
print(bigint_sqrt(width), bigint_gcd(bigint("-84"), bigint("30")));
`,
    },
  },
  {
    title: 'EOF-aware input',
    description: 'Distinguish blank UTF-8 lines from EOF (alpha.10)',
    entry: 'main.srp',
    files: {
      // Published compiler examples/line_inventory.srp.
      'main.srp': `// Read explicit UTF-8 input, preserving blank lines.
var entries: integer = 0;
var line = try_read_line();
while line[0] {
    entries += 1;
    print(entries, "[", line[1], "]");
    line = try_read_line();
}
print("Lines:", entries);
`,
    },
    stdin: 'नमस्ते\n\ncafé 🌍',
  },
  {
    title: 'Input with fallback',
    description: 'Read a line or select a default at EOF (alpha.10)',
    entry: 'main.srp',
    files: {
      'main.srp': 'bind first = read_line_or("Anonymous");\nbind second = read_line_or("Guest");\nprint(first, second);\n',
    },
    stdin: 'Ada\n',
  },
  {
    title: 'Exact decimal arithmetic',
    description: 'Exact base-10 arithmetic, arrays and rounded division (alpha.11)',
    entry: 'main.srp',
    files: { 'main.srp': "pure funcra taxed(price: decimal, rate: decimal) -> decimal {\n    return price + price * rate;\n}\n\nbind total: decimal = taxed(decimal(\"199.99\"), decimal(\"0.18\"));\nbind scores: array<decimal, 2> = [array: decimal(\"0.1\"), decimal(\"0.2\")];\nprint(decimal_format(total, 2, \"half_even\"));\nprint(scores[0] + scores[1]);\nprint(decimal_div_rounded(decimal(\"1\"), decimal(\"3\"), 2, \"half_even\"));\n" },
  },
  {
    title: 'Decimal across modules',
    description: 'Imported typed exact decimal function (alpha.11)',
    entry: 'main.srp',
    files: {
      'main.srp': "import \"math/price.srp\" as price;\nprint(price.sum(decimal(\"0.1\"), decimal(\"0.2\")));\n",
      'math/price.srp': "pub pure funcra sum(a: decimal, b: decimal) -> decimal {\n    return a + b;\n}\n",
    },
  },
  {
    title: 'Buffered decimal input',
    description: 'Exact decimal with ephemeral stdin, not interactive prompts (alpha.11)',
    entry: 'main.srp',
    files: { 'main.srp': "print(decimal_format(decimal(read_line()), 2, \"half_even\"));\n" },
    stdin: '1.225\n',
  },
  // Exact source fixtures from the published Scarp v0.0.6-alpha.12 compiler.
  {
  "title": "Data destructuring",
  "description": "Typed tuple and fixed-array patterns (alpha.12)",
  "entry": "main.srp",
  "files": {
    "main.srp": "// Structural destructuring evaluates one initializer for multiple bindings.\npure funcra make_pair(value: integer) -> tuple<integer, string> {\n    return (value * 2, \"ready\");\n}\n\nbind (result, state) = make_pair(21);\nprint(result, state);\n\nvar [first, second, third] = [array: 3, 5, 7];\nfirst += second;\nprint(first, third);\n\n// The underscore ignores the corresponding element, without storing it.\nbind (_, answer) = (true, 42);\nprint(answer);\n\n{\n    bind (result, note) = (5, \"inner\");\n    print(result, note);\n}\nprint(result);\n\nbind ([(quantity, unit_price), (_, spare_price)], currency) =\n    ([array: (2, 15), (1, 7)], \"INR\");\nprint(quantity * unit_price + spare_price, currency);\n"
  }
},
  {
  "title": "Typed records and lists",
  "description": "Typed records, immutable lists and snapshots (alpha.12)",
  "entry": "main.srp",
  "files": {
    "main.srp": "// Source-level typed dynamic lists: immutable values with a length-independent type.\n// Every binding retains a snapshot and list indexing is checked at runtime.\nrecord Task {\n    title: string,\n    done: boolean,\n}\n\npure funcra first_title(tasks: list<record Task>) -> string {\n    return tasks[0]->title;\n}\n\nbind one: list<record Task> = [list:\n    new Task { title: \"Draft\", done: false },\n    new Task { title: \"Review\", done: true },\n];\nbind unchanged = one;\n\nvar tasks: list<record Task> = one;\nprint(\"First\", first_title(tasks));\ntasks = [list:\n    new Task { title: \"Ready\", done: true },\n    new Task { title: \"Review\", done: true },\n    new Task { title: \"Publish\", done: false },\n];\nassert(unchanged[0]->title == \"Draft\");\nprint(\"Updated\", first_title(tasks), tasks[2]->title);\nbind empty: list<integer> = [list: <integer>];\nprint(\"Empty\", empty);\nbind nested: list<list<integer>> = [list: [list: 1, 2], [list: 3]];\nprint(\"Nested\", nested[0][1], nested[1][0]);\n"
  }
},
  {
  "title": "Typed immutable maps",
  "description": "Canonical sorted maps and nested typed values (alpha.12)",
  "entry": "main.srp",
  "files": {
    "main.srp": "// Typed, immutable maps have canonical ordering irrespective of source order.\npure funcra labels() -> map<string, integer> {\n    return [map: \"z\": 9, \"a\": 1];\n}\n\nbind original = labels();\nbind reversed = [map: \"a\": 1, \"z\": 9];\nprint(original);\nprint(original == reversed);\nbind empty: map<integer, string> = [map: <integer, string>];\nprint(empty);\nbind features: map<boolean, string> = [map: true: \"enabled\", false: \"disabled\"];\nprint(features);\nbind nested: map<integer, list<integer>> = [map:\n    2: [list: 1, 2],\n    1: [list: 3],\n];\nprint(nested);\n"
  }
},
  {
  "title": "Option/Result propagation",
  "description": "Checked variants, explicit ? propagation and early return (alpha.12)",
  "entry": "main.srp",
  "files": {
    "main.srp": "// Development-only: explicit propagation from immutable bindings.\nrecord Task { title: string }\n\npure funcra validate_title(value: option<string>) -> result<string, string> {\n    match on value {\n        case None { return new result<string, string>::Err(\"title missing\"); }\n        case Some(title) {\n            if title == \"\" {\n                return new result<string, string>::Err(\"title empty\");\n            }\n            return new result<string, string>::Ok(title);\n        }\n    }\n}\n\n// Failure skips the remaining body and returns Err from this function.\n// The successful payload is bound to title, with no unchecked extraction.\npure funcra submit(value: option<string>) -> result<record Task, string> {\n    bind title: string = validate_title(value)?;\n    return new result<record Task, string>::Ok(new Task { title: title });\n}\n\n// Absence also propagates between distinct Option payload types.\npure funcra has_title(value: option<string>) -> option<boolean> {\n    bind title = value?;\n    return new option<boolean>::Some(title != \"\");\n}\n\nfuncra present(outcome: result<record Task, string>) -> unit {\n    match on outcome {\n        case Ok(task) { print(\"Saved\", task->title); }\n        case Err(message) { print(\"Rejected\", message); }\n    }\n}\n\npresent(submit(new option<string>::Some(\"Review PR\")));\npresent(submit(new option<string>::Some(\"\")));\npresent(submit(new option<string>::None()));\nmatch on has_title(new option<string>::None()) {\n    case None { print(\"No title\"); }\n    case Some(value) { print(value); }\n}\nmatch on has_title(new option<string>::Some(\"Ready\")) {\n    case None { print(\"No title\"); }\n    case Some(value) { print(value); }\n}\n"
  }
},
  {
  "title": "Map projections",
  "description": "Canonical ordered keys and values as immutable lists (alpha.12)",
  "entry": "main.srp",
  "files": {
    "main.srp": "// Maps expose their canonical ordering as immutable typed lists.\npure funcra ordered_labels(items: map<string, integer>) -> list<string> {\n    return map_keys(items);\n}\n\nbind mixed = [map: \"z\": 9, \"a\": 1, \"m\": 5];\nbind keys: list<string> = ordered_labels(mixed);\nbind values: list<integer> = map_values(mixed);\nprint(keys);\nprint(values);\nprint(keys[0], values[0]);\nprint(map_len(mixed));\n\nbind none: map<integer, string> = [map: <integer, string>];\nprint(map_keys(none));\nprint(map_values(none));\n\nbind boolean_keys = [map: true: \"enabled\", false: \"disabled\"];\nprint(map_keys(boolean_keys));\nprint(map_values(boolean_keys));\n"
  }
},
  {
  "title": "Task board across modules",
  "description": "Two modules: records, variants, lists, maps and Result (alpha.12)",
  "entry": "main.srp",
  "files": {
    "main.srp": "import \"board.srp\" as tasks;\n\nbind initial = tasks.empty();\nvar board = initial;\nmatch on tasks.apply(board, new tasks.Action::Add(new option<string>::Some(\"Review PR\"))) {\n    case Ok(next) { board = next; print(\"Created Review PR\"); }\n    case Err(message) { print(message); }\n}\nmatch on tasks.apply(board, new tasks.Action::Complete(\"Review PR\")) {\n    case Ok(next) { board = next; }\n    case Err(message) { print(message); }\n}\nmatch on tasks.find(board, \"Review PR\") {\n    case Some(task) { print(task->title, task->done); }\n    case None { print(\"Task missing\"); }\n}\nmatch on tasks.apply(board, new tasks.Action::Complete(\"Missing\")) {\n    case Ok(_) { print(\"Unexpected success\"); }\n    case Err(message) { print(\"Rejected\", message); }\n}\nprint(\"Original size\", list_len(initial->tasks));\n",
    "board.srp": "// A bounded task store with an exact-title index and pure transitions.\npub record Task {\n    title: string,\n    done: boolean,\n}\n\npub record Board {\n    tasks: list<record Task>,\n    positions: map<string, integer>,\n}\n\npub variant Action {\n    Add(option<string>),\n    Complete(string),\n}\n\npub pure funcra empty() -> record Board {\n    return new Board {\n        tasks: [list: <record Task>],\n        positions: [map: <string, integer>],\n    };\n}\n\npub pure funcra find(board: record Board, title: string) -> option<record Task> {\n    if not map_contains(board->positions, title) {\n        return new option<record Task>::None();\n    }\n    bind index = map_get_or(board->positions, title, 0);\n    return new option<record Task>::Some(board->tasks[index]);\n}\n\npure funcra accept_title(input: option<string>) -> result<string, string> {\n    match on input {\n        case None { return new result<string, string>::Err(\"title missing\"); }\n        case Some(title) {\n            if title == \"\" {\n                return new result<string, string>::Err(\"title empty\");\n            }\n            return new result<string, string>::Ok(title);\n        }\n    }\n}\n\npub pure funcra apply(board: record Board, action: variant Action) -> result<record Board, string> {\n    match on action {\n        case Add(input) {\n            bind title = accept_title(input)?;\n            if map_contains(board->positions, title) {\n                return new result<record Board, string>::Err(\"task already exists\");\n            }\n            bind index = list_len(board->tasks);\n            if index >= 128 {\n                return new result<record Board, string>::Err(\"board is full\");\n            }\n            return new result<record Board, string>::Ok(new Board {\n                tasks: list_push(board->tasks, new Task { title: title, done: false }),\n                positions: map_set(board->positions, title, index),\n            });\n        }\n        case Complete(title) {\n            match on find(board, title) {\n                case None {\n                    return new result<record Board, string>::Err(\"task not found\");\n                }\n                case Some(task) {\n                    if task->done {\n                        return new result<record Board, string>::Ok(board);\n                    }\n                    bind index = map_get_or(board->positions, title, 0);\n                    return new result<record Board, string>::Ok(new Board {\n                        tasks: list_set(board->tasks, index, new Task { title: title, done: true }),\n                        positions: board->positions,\n                    });\n                }\n            }\n        }\n    }\n}\n"
  }
},
  // Exact public fixture source from the annotated Scarp v0.0.6-alpha.13 tag.
  {
    title: "Ordered map snapshots",
    description: "Canonical map key/value order and immutable updates (alpha.13)",
    entry: 'main.srp',
    files: { 'main.srp': "// Canonical order and immutable snapshots after persistent map updates.\nbind original = [map: 3: \"three\", 1: \"one\", 2: \"two\"];\nbind keys = map_keys(original);\nbind values = map_values(original);\nbind updated = map_set(original, 2, \"TWO\");\nbind reduced = map_remove(updated, 1);\nprint(keys);\nprint(values);\nprint(map_keys(reduced));\nprint(map_values(reduced));\nprint(map_len(original), map_len(reduced));\n" },
  },
  {
    title: "Boolean map snapshots",
    description: "Deterministic Boolean map snapshots (alpha.13)",
    entry: 'main.srp',
    files: { 'main.srp': "// Persistent map projections and deterministic boolean key order.\nbind flags = [map: true: \"enabled\", false: \"disabled\"];\nbind original_keys = map_keys(flags);\nbind original_values = map_values(flags);\nbind changed = map_set(flags, false, \"off\");\nprint(original_keys);\nprint(original_values);\nprint(map_values(changed));\nprint(map_len(flags), map_len(changed));\n" },
  },
  {
    title: "Persistent task list snapshots",
    description: "Pure persistent task collection operations (alpha.13)",
    entry: 'main.srp',
    files: { 'main.srp': "// Pure persistent collection operations: no mutation of published snapshots.\nrecord Task { title: string, done: boolean }\n\npure funcra add_task(tasks: list<record Task>, title: string) -> list<record Task> {\n    return list_push(tasks, new Task { title: title, done: false });\n}\n\nbind empty: list<record Task> = [list: <record Task>];\nbind first = add_task(empty, \"Draft\");\nbind second = add_task(first, \"Review\");\nprint(\"Counts\", list_len(empty), list_len(first), list_len(second));\nprint(\"First\", second[0]->title, second[1]->title);\n\n// Replacing and removing return new lists without affecting their input.\nbind reviewed = list_set(second, 1, new Task { title: \"Approved\", done: true });\nbind only_one = list_remove(reviewed, 0);\nprint(\"Snapshots\", second[1]->title, reviewed[1]->title);\nprint(\"Remaining\", list_len(only_one), only_one[0]->title);\nassert(list_len(empty) == 0);\nassert(list_len(first) == 1);\nassert(list_len(second) == 2);\nassert(only_one[0]->done);\n\n// Length-independent list<T> permits assigning a new complete snapshot.\nvar active: list<record Task> = first;\nactive = only_one;\nprint(\"Active\", active[0]->title);\n" },
  },
  {
    title: "Immutable compiler fixture",
    description: "Immutable map outputs in an official alpha.13 cache regression fixture",
    entry: 'main.srp',
    files: { 'main.srp': "// The same immutable program can be executed from a fresh or cached compile.\nbind initial = [map: \"b\": 2, \"a\": 1];\nbind updated = map_set(initial, \"a\", 7);\nprint(map_get_or(initial, \"a\", 0));\nprint(map_get_or(updated, \"a\", 0));\nprint(map_keys(updated)[0]);\n" },
  },
  // Exact source from the immutable Scarp v0.0.6-alpha.14 release.
  {
    title: "Nested pattern matching",
    description: "Nominal record/variant matching and tuple binding (alpha.14)",
    entry: 'main.srp',
    files: { 'main.srp': "// Nested record and tuple patterns must bind exactly once per selected arm.\nrecord Point { x: integer, y: integer }\nvariant Event { Move(record Point), Idle }\n\nbind event = new Event::Move(new Point { x: 12, y: 30 });\nmatch on event {\n    case Move({x: horizontal, y: vertical}) {\n        print(horizontal);\n        print(vertical);\n    }\n    case Idle { print(0); }\n}\n\nbind pair = (4, 9);\nbind (first, second) = pair;\nprint(first + second);\n" },
  },
  {
    title: "Ordered string-map projections",
    description: "Immutable map snapshots with paired keys and values (alpha.14)",
    entry: 'main.srp',
    files: { 'main.srp': "// Deterministic map projections remain paired after persistent updates.\nbind original = [map: \"z\": 9, \"a\": 1, \"m\": 5];\nbind inserted = map_set(original, \"b\", 2);\nbind replaced = map_set(inserted, \"m\", 50);\nbind removed = map_remove(replaced, \"z\");\n\nprint(map_keys(original));\nprint(map_values(original));\nprint(map_keys(inserted));\nprint(map_values(inserted));\nprint(map_keys(replaced));\nprint(map_values(replaced));\nprint(map_keys(removed));\nprint(map_values(removed));\nprint(map_keys(original));\nprint(map_values(original));\n" },
  },
  {
    title: "Median and quantiles",
    description: "Published finite vector statistics and windows (alpha.16)",
    entry: 'main.srp',
    files: {
      "main.srp": "// Median and type-7 quantiles use a bounded, immutable sorted copy.\nbind samples = [4.0, 1.0, 7.0, 2.0];\nprint(median(samples));\nprint(quantile(samples, 0.25));\nprint(quantile(samples, 0.75));\nbind visible = window(samples, 1, 3);\nprint(median(visible));\nprint(samples);\n",
    },
  },
  {
    title: "Unicode and integer utilities",
    description: "Published Unicode, 64-bit helpers and typed modules (alpha.16)",
    entry: 'main.srp',
    files: {
      "main.srp": "import \"modules/collection_tools.srp\" as collections;\n\nbind labels = collections.labels();\nprint(labels[0], labels[1], labels[2]);\nprint(text_rfind(labels[2], \"न\"), text_count(labels[2], \"न\"));\nprint(integer_abs(-42), integer_sign(-42), integer_gcd(-42, 30), integer_lcm(-42, 30));\nprint(bits_count_ones(-1), bits_leading_zeros(1), bits_rotate_left(1, 63));\n",
      "modules/collection_tools.srp": "pub pure funcra labels(text: string = \"नमवनA\") -> array<string, 3> {\n    bind globe = text_from_codepoint(0x1f30d);\n    return [array: text_upper(\"Straße\"), text_lower(\"İ\"), text_concat(text_reverse(text), globe)];\n}\n",
    },
  },
  // Exact published compiler fixtures. Keep these sources byte-identical.
  {
    title: "Fixed-array traversal",
    description: "Loop over arrays and use bounds-safe fallbacks (alpha.17)",
    entry: 'main.srp',
    files: { 'main.srp': "bind readings = [array: 10, 20, 30];\nvar total = 0;\nrepeat array_len(readings) as index {\n    total += readings[index];\n}\nprint(\"Total:\", total);\nprint(\"Missing reading:\", array_get_or(readings, 3, 0));\nprint(\"Empty length:\", array_len([array: <integer>]));\n" },
  },
  {
    title: "Immutable array updates",
    description: "Copy-on-update fixed-array snapshots (alpha.18)",
    entry: 'main.srp',
    files: { 'main.srp': "pure funcra replace_last(values: array<integer, 3>) -> array<integer, 3> {\n    return array_set(values, 2, 100);\n}\n\nbind original = [array: 4, 8, 12];\nbind updated = array_set(original, 1, 99);\nprint(original[1], updated[1], array_len(updated));\n\nbind nested = [array: [array: \"one\"], [array: \"two\"]];\nbind localized = array_set(nested, 0, [array: \"नमस्ते\"]);\nprint(nested[0][0], localized[0][0]);\nprint(replace_last(updated)[2]);\n" },
  },
  {
    title: "Lifetime windows",
    description: "Immutable views and empty window semantics (alpha.18)",
    entry: 'main.srp',
    files: { 'main.srp': "// Lifetime preserves value snapshots without explicit memory management.\nbind data = [1.0, 2.0, 3.0];\nbind tail = window(data, 1, 2);\nbind empty = window(data, 2, 0);\nprint(len(empty), tail);\n\nbind numbers: integers = [integer: 7, 8, 9];\nbind empty_numbers = ints_window(numbers, 2, 0);\nprint(ints_len(empty_numbers), ints_window(numbers, 1, 2));\n" },
  },
  {
    title: "Fixed-array concatenation",
    description: "Join same-typed fixed arrays without mutating snapshots (v0.0.7-alpha.1)",
    entry: 'main.srp',
    files: { 'main.srp': "// Joining two snapshots determines the output length at compile time.\npure funcra readings(first: array<integer, 2>, last: array<integer, 1>) -> array<integer, 3> {\n    return array_concat(first, last);\n}\n\nbind morning = [array: 12, 18];\nbind full_day = readings(morning, [array: 24]);\nprint(morning);\nprint(full_day);\nprint(array_concat([array: <integer>], full_day));\n" },
  },
  {
    title: "Variadic integer reductions",
    description: "Compute GCD, HCF and LCM across several integers (v0.0.7-alpha.1)",
    entry: 'main.srp',
    files: { 'main.srp': "print(integer_hcf(12,18),integer_hcf(12,18,24),integer_gcd(24,36,48,60),integer_lcm(4,6,8,12));\n" },
  },
  {
    title: "Stable vector softplus",
    description: "Evaluate finite activation values and check extreme input behavior (v0.0.7-alpha.1)",
    entry: 'main.srp',
    files: { 'main.srp': "bind values = softplus([-1000.0, 0.0, 1000.0]);\nprint(len(values));\nprint(values[0] >= 0.0, values[0] < 0.001);\nprint(values[1] > 0.69, values[1] < 0.70);\nprint(values[2] == 1000.0);\n" },
  },
  {
    title: "Call-frame snapshot reuse",
    description: "Retain returned arrays across repeated function calls (v0.0.7-alpha.1)",
    entry: 'main.srp',
    files: { 'main.srp': "pure funcra pair(n: integer) -> array<integer, 2> {\n    return [array: n, n + 1];\n}\nbind first = pair(7);\nrepeat 20 as i {\n    bind next = pair(i);\n    assert(next[0] == i);\n}\nprint(first);\nprint(pair(42));\n" },
  },
  // Alpha.20's tuple examples are byte-for-byte copies of the published compiler fixtures.
  {
    title: 'Tuple element updates',
    description: 'Mutable tuple slots with persistent value snapshots (alpha.20)',
    entry: 'main.srp',
    files: { 'main.srp': "// Development-only example: persistent tuple indexed assignment.\n// Run with a compiler build containing the tuple assignment feature.\nvar position = (10, 20);\nbind old = position;\nposition[0] = 50;\nposition[1] = 100;\nprint(position); // (50, 100)\nprint(old);      // (10, 20)\n" },
  },
  {
    title: 'Tuple ordering',
    description: 'Lexicographic ordering of compatible numeric tuples (alpha.20)',
    entry: 'main.srp',
    files: { 'main.srp': "// Experimental lexicographic ordering of numeric tuples (development source).\nbind origin = (10, 20);\nbind target = (30, 40);\nprint(origin < target); // true\nprint(origin >= target); // false\nprint((1, (2, 3)) < (1, (2, 4))); // true\nprint((0.0,) <= (-0.0,)); // true\n" },
  },
  {
    title: 'Exact decimal literals',
    description: '0.1d + 0.2d is exact; unsuffixed floats keep binary64 behavior (alpha.20)',
    entry: 'main.srp',
    files: { 'main.srp': "// Alpha.20 exact base-ten literals are opt-in, unlike binary64 floats.\nprint(0.1d + 0.2d, 0.3d == 0.1d + 0.2d);\nprint(0.1 + 0.2);\n" },
  },
  {
    title: 'Named function boundaries',
    description: 'Published alpha.19 named pure and effectful calls (no function values)',
    entry: 'main.srp',
    files: { 'main.srp': "// Named function calls are executable; first-class aliases remain unsupported.\npure funcra twice(n: integer) -> integer {\n    return n * 2;\n}\n\nfuncra report(n: integer) -> integer {\n    print(twice(n));\n    return n + 1;\n}\n\nprint(report(6));\n" },
  },
  {
    title: 'Typed Boolean prompts',
    description: 'Official alpha.17 typed console prompt with pre-supplied lines',
    entry: 'main.srp',
    files: { 'main.srp': "// Run with scarp exec --interactive examples/interactive/boolean_prompt.srp.\nrepeat 2 as attempt {\n    bind confirmed: boolean = input_boolean(\"Continue (true/false)? \");\n    if confirmed {\n        print(\"Continuing\");\n    } else {\n        print(\"Stopped\");\n        break;\n    }\n}\n" },
    stdin: "true\nfalse\n",
    allowPrompts: true,
  },
  {
    title: 'Import a module',
    description: 'Two real .srp source files',
    entry: 'main.srp',
    files: {
      'main.srp': 'import "math.srp" as math;\nprint(math.twice(21));\n',
      'math.srp': 'pub pure funcra twice(n: integer) -> integer { return n * 2; }\n',
    },
  },
  {"title":"Generic functions and inference","description":"Explicit type arguments, contextual inference and Numeric constraints (v0.0.7-alpha.3)","entry":"main.srp","files":{"main.srp":"pure funcra identity<T>(value: T) -> T { return value; }\npure funcra pair<A, B>(a: A, b: B) -> tuple<A, B> { return (a, b); }\npure funcra vacant<T>() -> list<T> { return [list: <T>]; }\npure funcra square<T: Numeric>(value: T) -> T { return value * value; }\n\nbind names: list<string> = vacant();\nprint(identity(100), identity(\"Scarp\"), identity(true));\nprint(pair(b: \"Scarp\", a: identity::<integer>(7)));\nprint(list_len(names), square(5), square(0.1d));\n"}},
  {"title":"Generic Option and Result","description":"Typed payloads, matching and Result propagation (v0.0.7-alpha.3)","entry":"main.srp","files":{"main.srp":"pure funcra some<T>(value: T) -> option<T> {\n    return new option<T>::Some(value);\n}\npure funcra none<T>() -> option<T> { return new option<T>::None(); }\npure funcra unwrap<T>(input: option<T>, fallback: T) -> T {\n    match on input {\n        case Some(value) { return value; }\n        case None { return fallback; }\n    }\n}\npure funcra wrap<T, E>(input: result<T, E>) -> result<tuple<T>, E> {\n    bind value = input?;\n    return new result<tuple<T>, E>::Ok((value,));\n}\nfuncra display(input: result<tuple<integer>, string>) -> unit {\n    match on input {\n        case Ok((value,)) { print(value); }\n        case Err(error) { print(error); }\n    }\n}\nbind absent: option<integer> = none();\nprint(unwrap(some(\"Scarp\"), \"missing\"), unwrap(absent, 9));\ndisplay(wrap(new result<integer, string>::Ok(12)));\ndisplay(wrap(new result<integer, string>::Err(\"failed\")));\n"}},
  {"title":"String operators and literals","description":"Concatenation, repetition, raw and multiline strings (v0.0.7-alpha.3)","entry":"main.srp","files":{"main.srp":"bind name: string = \"Sanskar\";\nbind programming_language: string = \"Scarp Programming Language\";\nprint(name + \"\\n\" + programming_language);\nprint(\"Scarp \" * 2);\nprint(r\"literal\\n\");\nprint(\"\"\"first\nsecond\"\"\");\n"}},
  {"title":"Mutual recursion and GCD","description":"Recursive named calls and Euclidean reduction (v0.0.7-alpha.4)","entry":"main.srp","files":{"main.srp":"// Alternate frames while reducing the Euclidean remainder.\npure funcra gcd(left: integer, right: integer) -> integer {\n    if right == 0 {\n        return left;\n    }\n    return reduce(left, right);\n}\n\npure funcra reduce(left: integer, right: integer) -> integer {\n    return gcd(right, left % right);\n}\n\nprint(gcd(1071, 462));\n"}},
  {"title":"Nested aggregate snapshots","description":"Records, tuples and fixed arrays retain immutable snapshots (v0.0.7-alpha.4)","entry":"main.srp","files":{"main.srp":"// A frame snapshot contains records, tuples and fixed-size arrays.\nrecord Lane {\n    enabled: boolean,\n    payload: tuple<integer, array<integer, 2>>,\n}\n\nrecord Window {\n    lanes: array<record Lane, 2>,\n    offset: integer,\n}\n\npure funcra entry(index: integer, input: integer) -> integer {\n    bind first = new Lane { payload: (input, [array: input + 1, input + 2]), enabled: true };\n    bind second = new Lane { enabled: false, payload: (0, [array: 1, 2]) };\n    var state = new Window { offset: 2, lanes: [array: first, second] };\n    bind snapshot = state;\n    if input < 0 {\n        state = new Window { lanes: [array: second, first], offset: 10 };\n    }\n    bind selected = state->lanes[index];\n    bind payload = if selected->enabled { selected->payload } else { snapshot->lanes[0]->payload };\n    return payload[1][index] + state->offset;\n}\n\nprint(entry(0, 7));\nprint(entry(1, -7));\n"}},
  {"title":"BigInt wide exponents","description":"Exact BigInt powers and modular arithmetic under browser budgets (v0.0.7-alpha.4)","entry":"main.srp","files":{"main.srp":"bind exponent = bigint(\"340282366920938463463374607431768211456\");\nprint(bigint_pow_big(bigint(\"-1\"), exponent));\nprint(bigint_pow_mod_big(bigint(\"-12345678901234567890987654321\"),\n                        exponent, bigint(\"4294967291\")));\nprint(bigint_pow_big(bigint(\"-10\"), bigint(\"17\")));\n"}},
  {"title":"Contextual generic imports","description":"Infer nested generic types from result context across two modules (v0.0.7-alpha.4)","entry":"main.srp","files":{"main.srp":"import \"lib.srp\" as lib;\nbind ids: list<integer> = lib.keep(tag: \"ids\", items: lib.blank());\nbind flags: list<boolean> = lib.keep(items: (lib.blank()), tag: 7);\nbind more: list<integer> = lib.keep(lib.blank(), \"more\");\nprint(ids, flags, more);\n","lib.srp":"pub pure funcra blank<T>() -> list<T> { return [list: <T>]; }\npub pure funcra keep<T, U>(items: list<T>, tag: U) -> list<T> { return items; }\n"}},
  {"title":"BigInt sequences and number theory","description":"Fibonacci, factorial, combinations, primes and exact predicates (v0.0.7-alpha.4)","entry":"main.srp","files":{"main.srp":"// Exact sequence and combinatorial operations, adapted from upstream tests.\nprint(bigint_fibonacci(0), bigint_fibonacci(100));\nprint(bigint_factorial(20));\nprint(bigint_binomial(10, 3), bigint_permutation(10, 3));\nprint(bigint_next_prime(bigint(\"100\")));\nprint(bigint_is_perfect_square(bigint(\"144\")), bigint_is_power_of_two(bigint(\"128\")));\nprint(bigint_reverse(bigint(\"-1200\")), bigint_is_palindrome(bigint(\"12321\")));\nprint(bigint_min(bigint(\"-7\"), bigint(\"2\")), bigint_max(bigint(\"-7\"), bigint(\"2\")));\nprint(bigint_mod_inverse(bigint(\"3\"), bigint(\"11\")), bigint_is_prime(bigint(\"97\")));\n"}},
];
