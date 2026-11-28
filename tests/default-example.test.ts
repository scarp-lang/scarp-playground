import { describe, expect, it } from 'vitest';
import { defaultExample } from '../src/default-example';
import { examples } from '../src/examples';
import { isUntouchedExampleSession } from '../src/example-session';

describe('deferred catalogue bootstrap fixture', () => {
  it('uses the exact same default fixture as the first published example', () => {
    expect(examples[0]).toBe(defaultExample);
    expect(defaultExample.entry).toBe('main.srp');
    expect(defaultExample.files['main.srp']).toContain('print("Hello from Scarp!");');
    expect(defaultExample.stdin).toBeUndefined();
  });
  it('preserves exact untouched-example recognition after catalogue loading', () => {
    const workspace = { entry: defaultExample.entry, files: { ...defaultExample.files } };
    expect(isUntouchedExampleSession(workspace, '')).toBe(true);
    expect(isUntouchedExampleSession(workspace, 'edited')).toBe(false);
    workspace.files['main.srp'] += '\n';
    expect(isUntouchedExampleSession(workspace, '')).toBe(false);
  });
});
