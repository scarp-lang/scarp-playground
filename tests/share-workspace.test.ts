import { describe, expect, it } from 'vitest';
import { makeWorkspaceShareUrl, MAX_SHARE_URL_CHARS, readSharedWorkspace } from '../src/share-workspace';
import type { Workspace } from '../src/workspace';

const project: Workspace = {
  entry: 'main.srp',
  files: {
    'main.srp': 'import "lib/math.srp" as math; print(math.twice(21));',
    'lib/math.srp': 'pub pure funcra twice(n: integer) -> integer { return n * 2; }',
  },
};

describe('project sharing without a server', () => {
  it('keeps legacy #code= links working for short single files, including UTF-8', () => {
    const source = 'print("नमस्ते 😀");';
    const url = makeWorkspaceShareUrl('https://example.test', '/scarp-playground/', {
      entry: 'main.srp', files: { 'main.srp': source },
    }, 'main.srp');
    expect(url).toContain('#code=');
    expect(readSharedWorkspace(new URL(url!).hash)).toEqual({
      workspace: { entry: 'main.srp', files: { 'main.srp': source } },
      activeFile: 'main.srp',
    });
  });

  it('round-trips modules, entrypoint, active tab and Unicode deterministically', () => {
    const withUnicode: Workspace = {
      ...project, files: { ...project.files, 'messages.srp': 'print("नमस्ते 😀");' },
    };
    const make = (workspace: Workspace) =>
      makeWorkspaceShareUrl('https://example.test', '/scarp-playground/', workspace, 'messages.srp');
    const url = make(withUnicode);
    expect(url).toContain('#project=');
    expect(url).toBe(make({
      ...withUnicode, files: Object.fromEntries(Object.entries(withUnicode.files).reverse()),
    }));
    expect(readSharedWorkspace(new URL(url!).hash)).toEqual({
      workspace: withUnicode, activeFile: 'messages.srp',
    });
  });

  it('preserves non-default file names, even for a one-file project', () => {
    const workspace: Workspace = { entry: 'src/start.srp', files: { 'src/start.srp': 'print(7);' } };
    const url = makeWorkspaceShareUrl('https://example.test', '/', workspace, 'src/start.srp');
    expect(url).toContain('#project=');
    expect(readSharedWorkspace(new URL(url!).hash)).toEqual({
      workspace, activeFile: 'src/start.srp',
    });
  });

  it('rejects malformed, unsupported, unsafe or excessive fragments', () => {
    expect(readSharedWorkspace('#project=%ZZ')).toBeNull();
    expect(readSharedWorkspace('#project=' + encodeURIComponent('{'))).toBeNull();
    expect(readSharedWorkspace('#unknown=anything')).toBeNull();
    expect(readSharedWorkspace('#project=' + 'x'.repeat(MAX_SHARE_URL_CHARS))).toBeNull();
    const malformed = {
      format: 'scarp-playground-workspace', version: 1,
      workspace: { entry: '../bad.srp', files: { '../bad.srp': 'print(1);' } },
    };
    expect(readSharedWorkspace('#project=' + encodeURIComponent(JSON.stringify(malformed)))).toBeNull();
    expect(readSharedWorkspace('#project=' + encodeURIComponent(JSON.stringify({
      ...malformed, version: 999,
    })))).toBeNull();
  });

  it('rejects oversized links and suggests portable export instead', () => {
    const tooLong: Workspace = {
      entry: 'main.srp', files: { 'main.srp': 'x'.repeat(10_000) },
    };
    expect(makeWorkspaceShareUrl('https://example.test', '/', tooLong, 'main.srp')).toBeNull();
    expect(makeWorkspaceShareUrl('https://example.test', '/', {
      entry: 'main.srp', files: { 'main.srp': 'x'.repeat(65 * 1024) },
    }, 'main.srp')).toBeNull();
  });
});
