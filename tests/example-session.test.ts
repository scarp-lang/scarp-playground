import { describe, expect, it } from 'vitest';
import { examples } from '../src/examples';
import { isUntouchedExampleSession } from '../src/example-session';
import type { Workspace } from '../src/workspace';

function copy(index: number): Workspace {
  const example = examples[index];
  return { entry: example.entry, files: { ...example.files } };
}

describe('lossless built-in example switching', () => {
  it('accepts every unmodified shipped sample, including its default stdin', () => {
    for (let index = 0; index < examples.length; index++) {
      expect(isUntouchedExampleSession(copy(index), examples[index].stdin ?? '')).toBe(true);
    }
  });

  it('detects changed source content even if source filenames are unchanged', () => {
    const sample = copy(0);
    sample.files[sample.entry] += 'print("My work");\n';
    expect(isUntouchedExampleSession(sample, '')).toBe(false);
  });

  it('requires an exact set of source files and exact entry path', () => {
    const sample = copy(0);
    sample.files['extra.srp'] = '// scratch\n';
    expect(isUntouchedExampleSession(sample, '')).toBe(false);
    delete sample.files['extra.srp'];
    sample.entry = 'other.srp';
    expect(isUntouchedExampleSession(sample, '')).toBe(false);
  });

  it('does not depend on source-file insertion order for multi-module programs', () => {
    const index = examples.findIndex(example => Object.keys(example.files).length > 1);
    expect(index).toBeGreaterThanOrEqual(0);
    const sample = copy(index);
    sample.files = Object.fromEntries(Object.entries(sample.files).reverse());
    expect(isUntouchedExampleSession(sample, examples[index].stdin ?? '')).toBe(true);
  });

  it('protects the user’s modified ephemeral input even if source was not edited', () => {
    const index = examples.findIndex(example => example.stdin !== undefined);
    expect(index).toBeGreaterThanOrEqual(0);
    const sample = copy(index);
    expect(isUntouchedExampleSession(sample, examples[index].stdin ?? '')).toBe(true);
    expect(isUntouchedExampleSession(sample, 'my user input\n')).toBe(false);
  });
});
