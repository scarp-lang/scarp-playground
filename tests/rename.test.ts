import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
  decodeRenameReply, previewSymbolRename, validRenameName,
  verifyRenameSnapshot, MAX_RENAME_SITES, type RenameResult,
} from '../src/navigation/rename';

const source = { entry: 'main.srp', files: {
  'main.srp': 'bind answer = 42; print(answer);',
} };
const valid: Extract<RenameResult, { ok: true }> = {
  ok: true, old_name: 'answer', new_name: 'result', kind: 'binding',
  changes: 2, changed_files: ['main.srp'],
  edits: [{ path: 'main.srp', start: 5, end: 11 }, { path: 'main.srp', start: 24, end: 30 }],
  files: { 'main.srp': 'bind result = 42; print(result);' },
};

describe('compiler-checked rename validation', () => {
  it('requires one bounded ASCII Scarp identifier', () => {
    expect(validRenameName('_result2')).toBe(true);
    for (const name of ['', '2name', 'with-hyphen', 'नाम', 'x'.repeat(65)]) {
      expect(validRenameName(name)).toBe(false);
    }
  });

  it('accepts a valid bounded rename preview and rejects invalid shapes', () => {
    expect(verifyRenameSnapshot(source, 'result', decodeRenameReply(JSON.stringify(valid))))
      .toEqual(valid);
    const bad = [
      'not json',
      JSON.stringify({ ...valid, changes: MAX_RENAME_SITES + 1 }),
      JSON.stringify({ ...valid, new_name: '../result' }),
      JSON.stringify({ ...valid, changed_files: ['../secret.srp'] }),
      JSON.stringify({ ...valid, changed_files: ['main.srp', 'main.srp'] }),
      JSON.stringify({ ...valid, files: { '../secret.srp': 'no' } }),
      JSON.stringify({ ...valid, files: { 'main.srp': 'x'.repeat(65 * 1024) } }),
      JSON.stringify({ ...valid, kind: 23 }),
      JSON.stringify({ ...valid, edits: [] }),
      JSON.stringify({ ...valid, edits: [{ path: 'main.srp', start: 5, end: 11 }] }),
      JSON.stringify({ ...valid, edits: [{ path: 'main.srp', start: -1, end: 5 }, valid.edits[1]] }),
      JSON.stringify({ ...valid, edits: [{ path: 'main.srp', start: 5, end: 14 }, valid.edits[1]] }),
    ];
    for (const candidate of bad) {
      expect(decodeRenameReply(candidate)).toMatchObject({
        ok: false, error: expect.stringContaining('Invalid or oversized'),
      });
    }
  });

  it('rejects forged changed paths and workspace file membership', () => {
    const withNewFile = { ...valid, files: {
      ...valid.files, 'other.srp': 'print(99);',
    }, changed_files: ['main.srp', 'other.srp'] };
    expect(verifyRenameSnapshot(source, 'result', decodeRenameReply(JSON.stringify(withNewFile))))
      .toMatchObject({ ok: false });
    expect(verifyRenameSnapshot(source, 'different', valid))
      .toMatchObject({ ok: false });
    expect(verifyRenameSnapshot(source, 'result', {
      ...valid, files: { ...source.files }, changed_files: ['main.srp'],
    })).toMatchObject({ ok: false });

    // Each response must be exactly reproducible from its compiler byte spans.
    for (const forged of [
      { ...valid, files: { 'main.srp': 'bind result = 42; print(result); // injected' } },
      { ...valid, edits: [valid.edits[1], valid.edits[1]] },
      { ...valid, edits: [{ path: 'main.srp', start: 6, end: 12 }, valid.edits[1]] },
      { ...valid, edits: [{ path: 'other.srp', start: 5, end: 11 }, valid.edits[1]] },
      { ...valid, changed_files: ['main.srp', 'other.srp'] },
    ]) {
      expect(verifyRenameSnapshot(source, 'result', forged))
        .toMatchObject({ ok: false });
    }
  });
});

class FakeWorker {
  static instances: FakeWorker[] = [];
  posted: unknown[] = [];
  terminated = 0;
  onmessage: ((event: MessageEvent<{ id: number; rename: unknown }>) => void) | null = null;
  onmessageerror: (() => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  constructor() { FakeWorker.instances.push(this); }
  postMessage(payload: unknown) { this.posted.push(payload); }
  terminate() { this.terminated++; }
  send(reply: unknown) {
    this.onmessage?.({ data: { id: 1, rename: reply } } as MessageEvent<{ id: number; rename: unknown }>);
  }
}

beforeEach(() => {
  FakeWorker.instances = [];
  vi.stubGlobal('Worker', FakeWorker);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('isolated rename preview worker', () => {
  it('runs compiler-owned rename mode and terminates without applying edits', async () => {
    const pending = previewSymbolRename(source, 'main.srp', 5, 'result');
    const worker = FakeWorker.instances[0];
    expect(worker.posted).toEqual([{
      id: 1, workspace: source, mode: 'rename',
      path: 'main.srp', offset: 5, new_name: 'result',
    }]);
    worker.send(valid);
    expect(await pending).toEqual(valid);
    expect(worker.terminated).toBe(1);
    expect(source.files['main.srp']).toContain('answer');
  });

  it('does not allocate workers for invalid names, paths or offsets', async () => {
    for (const [path, offset, name] of [
      ['main.srp', 5, '1bad'],
      ['../secret.srp', 0, 'result'],
      ['main.srp', 9999, 'result'],
    ] as const) {
      expect((await previewSymbolRename(source, path, offset, name)).ok).toBe(false);
    }
    expect(FakeWorker.instances).toHaveLength(0);
  });

  it('aborts, terminates and ignores delayed replies', async () => {
    const controller = new AbortController();
    const pending = previewSymbolRename(source, 'main.srp', 5, 'result', controller.signal);
    const worker = FakeWorker.instances[0];
    controller.abort();
    expect((await pending).ok).toBe(false);
    worker.send(valid);
    expect(worker.terminated).toBe(1);
  });
});
