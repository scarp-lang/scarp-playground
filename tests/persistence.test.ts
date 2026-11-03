import { describe, expect, it } from 'vitest';
import {
  LOCAL_WORKSPACE_KEY,
  MAX_LOCAL_SNAPSHOT_BYTES,
  forgetLocalWorkspace,
  parseLocalWorkspace,
  restoreLocalWorkspace,
  saveLocalWorkspace,
} from '../src/persistence';

function fakeStorage() {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => { data.set(key, value); },
    removeItem: (key: string) => { data.delete(key); },
  };
}

const project = {
  entry: 'main.srp',
  files: {
    'main.srp': 'import "math.srp" as math; print(math.twice(21));',
    'math.srp': 'pub pure funcra twice(n: integer) -> integer { return n * 2; }',
  },
};

describe('opt-in local workspaces', () => {
  it('saves and restores exact multi-file source and selected path', () => {
    const storage = fakeStorage();
    expect(restoreLocalWorkspace(storage)).toBeNull();
    expect(saveLocalWorkspace(storage, project, 'math.srp')).toBeNull();
    expect(restoreLocalWorkspace(storage)).toEqual({ workspace: project, activeFile: 'math.srp' });
    expect(forgetLocalWorkspace(storage)).toBe(true);
    expect(storage.getItem(LOCAL_WORKSPACE_KEY)).toBeNull();
  });

  it('rejects invalid version, malformed JSON and invalid file paths', () => {
    expect(parseLocalWorkspace('{')).toBeNull();
    expect(parseLocalWorkspace(JSON.stringify({ version: 99, workspace: project }))).toBeNull();
    expect(parseLocalWorkspace(JSON.stringify({
      version: 1, workspace: { entry: 'main.srp', files: { '../escape.srp': 'print(1);', 'main.srp': 'print(1);' } },
    }))).toBeNull();
    expect(parseLocalWorkspace('x'.repeat(MAX_LOCAL_SNAPSHOT_BYTES + 1))).toBeNull();
  });

  it('rejects malformed source values and never interprets stored data as code', () => {
    expect(parseLocalWorkspace(JSON.stringify({
      version: 1, workspace: { entry: 'main.srp', files: { 'main.srp': { dangerous: 'not source text' } } },
    }))).toBeNull();
  });

  it('falls back to the entrypoint if the old active file was removed', () => {
    const stored = parseLocalWorkspace(JSON.stringify({
      version: 1, workspace: project, activeFile: 'missing.srp',
    }));
    expect(stored?.activeFile).toBe('main.srp');
  });

  it('reports denied storage writes without throwing', () => {
    const denied = {
      getItem: () => null,
      setItem: () => { throw new Error('quota exceeded'); },
      removeItem: () => { throw new Error('denied'); },
    };
    expect(saveLocalWorkspace(denied, project, 'main.srp')).toMatch(/unavailable/);
    expect(forgetLocalWorkspace(denied)).toBe(false);
  });
});
