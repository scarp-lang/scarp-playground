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
    title: 'Import a module',
    description: 'Two real .srp source files',
    entry: 'main.srp',
    files: {
      'main.srp': 'import "math.srp" as math;\nprint(math.twice(21));\n',
      'math.srp': 'pub pure funcra twice(n: integer) -> integer { return n * 2; }\n',
    },
  },
];
