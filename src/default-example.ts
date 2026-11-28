import type { Example } from './examples';

/** The only fixture needed before the optional catalogue is loaded. */
export const defaultExample: Example = {
    title: 'Hello, Scarp',
    description: 'Output your first text',
    entry: 'main.srp',
    files: {
      'main.srp': '// From the official Scarp compiler examples/hello.srp\nprint("Hello from Scarp!");\n',
    },
  };
