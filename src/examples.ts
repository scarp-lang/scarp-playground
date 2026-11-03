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
    title: 'Import a module',
    description: 'Two real .srp source files',
    entry: 'main.srp',
    files: {
      'main.srp': 'import "math.srp" as math;\nprint(math.twice(21));\n',
      'math.srp': 'pub pure funcra twice(n: integer) -> integer { return n * 2; }\n',
    },
  },
];
