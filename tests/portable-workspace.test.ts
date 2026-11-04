import { describe, expect, it } from 'vitest';
import {
  MAX_PORTABLE_WORKSPACE_BYTES,
  parsePortableWorkspace,
  serializePortableWorkspace,
} from '../src/portable-workspace';

const workspace = {
  entry: 'main.srp',
  files: {
    'main.srp': 'import "lib/math.srp" as math; print(math.twice(21));',
    'lib/math.srp': 'pub pure funcra twice(n: integer) -> integer { return n * 2; }',
  },
};

describe('portable Scarp workspace JSON', () => {
  it('round-trips entry, selected tab, imports and UTF-8 source', () => {
    const source = { ...workspace, files: { ...workspace.files, 'words.srp': 'print("नमस्ते 😀");' } };
    const json = serializePortableWorkspace(source, 'words.srp');
    expect(json).not.toBeNull();
    expect(JSON.parse(json!).format).toBe('scarp-playground-workspace');
    expect(parsePortableWorkspace(json!)).toEqual({ workspace: source, activeFile: 'words.srp' });
  });

  it('exports deterministically and falls back to the entry for a missing tab', () => {
    const first = serializePortableWorkspace(workspace, 'missing.srp');
    const second = serializePortableWorkspace({
      entry: workspace.entry,
      files: Object.fromEntries(Object.entries(workspace.files).reverse()),
    }, 'missing.srp');
    expect(first).toBe(second);
    expect(parsePortableWorkspace(first!)?.activeFile).toBe('main.srp');
  });

  it('refuses untrusted or outdated formats and malformed values', () => {
    expect(parsePortableWorkspace('{')).toBeNull();
    const input = JSON.parse(serializePortableWorkspace(workspace, 'main.srp')!);
    for (const modified of [
      { ...input, version: 2 },
      { ...input, format: 'browser-storage' },
      { ...input, workspace: { ...input.workspace, files: [] } },
      { ...input, workspace: { ...input.workspace, files: { 'main.srp': { source: 'print(1)' } } } },
      { ...input, workspace: { entry: '../evil.srp', files: { '../evil.srp': 'print(1)' } } },
      { ...input, workspace: { entry: 'missing.srp', files: { 'main.srp': 'print(1);' } } },
    ]) {
      expect(parsePortableWorkspace(JSON.stringify(modified))).toBeNull();
    }
  });

  it('enforces import and export size caps', () => {
    expect(parsePortableWorkspace('x'.repeat(MAX_PORTABLE_WORKSPACE_BYTES + 1))).toBeNull();
    expect(parsePortableWorkspace(JSON.stringify({
      format: 'scarp-playground-workspace', version: 1,
      workspace: { entry: 'main.srp', files: { 'main.srp': 'a'.repeat(70 * 1024) } },
    }))).toBeNull();
    expect(serializePortableWorkspace({
      entry: 'main.srp', files: { 'main.srp': 'x'.repeat(70 * 1024) },
    }, 'main.srp')).toBeNull();
  });
});
