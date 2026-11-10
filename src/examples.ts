export type Example = {
  title: string;
  description: string;
  entry: string;
  files: Record<string, string>;
};

export const examples: Example[] = [
  {
    title: 'Hello, Scarp',
    description: 'Output your first text',
    entry: 'main.srp',
    files: {
      'main.srp': '// From the official Scarp compiler examples/hello.srp\nprint("Hello from Scarp!");\n',
    },
  },
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
    title: 'Import a module',
    description: 'Two real .srp source files',
    entry: 'main.srp',
    files: {
      'main.srp': 'import "math.srp" as math;\nprint(math.twice(21));\n',
      'math.srp': 'pub pure funcra twice(n: integer) -> integer { return n * 2; }\n',
    },
  },
];
