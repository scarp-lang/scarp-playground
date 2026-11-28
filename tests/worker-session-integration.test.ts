import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runWorkspace, checkWorkspace, verifyWorkspace } from '../src/runner/client';
import { findDefinition } from '../src/navigation/client';
import { findReferences } from '../src/navigation/references';
import { previewSymbolRename } from '../src/navigation/rename';
import { inspectSourceOutline } from '../src/navigation/outline-client';
import { inspectWorkspace } from '../src/navigation/inspection-client';

const workspace = {
  entry: 'main.srp',
  files: { 'main.srp': 'bind item = 1; print(item);' },
};

type Reply = { id: number; [key: string]: unknown };
class FakeWorker {
  static instances: FakeWorker[] = [];
  static crashOnPost = false;
  onmessage: ((event: MessageEvent<unknown>) => void) | null = null;
  onmessageerror: (() => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  posted: unknown[] = [];
  stopped = 0;
  constructor() { FakeWorker.instances.push(this); }
  postMessage(message: unknown) {
    if (FakeWorker.crashOnPost) throw Error('untrusted source text');
    this.posted.push(message);
  }
  terminate() { this.stopped++; }
  send(reply: Reply) { this.onmessage?.({ data: reply } as MessageEvent<unknown>); }
}

beforeEach(() => {
  FakeWorker.instances = [];
  FakeWorker.crashOnPost = false;
  vi.stubGlobal('Worker', FakeWorker);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('shared worker slot across all compiler actions', () => {
  it('preempts Run with References and then References with Outline', async () => {
    const run = runWorkspace(workspace);
    const runWorker = FakeWorker.instances[0];
    const refs = findReferences(workspace, 'main.srp', 6);
    const referenceWorker = FakeWorker.instances[1];
    expect(runWorker.stopped).toBe(1);
    expect((await run).error).toContain('cancelled');
    expect(referenceWorker.posted[0]).toMatchObject({ id: 1, mode: 'references' });
    const outline = inspectSourceOutline(workspace, 'main.srp');
    const outlineWorker = FakeWorker.instances[2];
    expect(referenceWorker.stopped).toBe(1);
    expect((await refs).ok).toBe(false);
    referenceWorker.send({ id: 1, references: { ok: true, references: [] } });
    expect(outlineWorker.posted[0]).toMatchObject({ id: 1, mode: 'outline' });
    outlineWorker.send({ id: 1, outline: { ok: false, error: 'Source cannot be outlined.' } });
    expect((await outline).ok).toBe(false);
    expect(outlineWorker.stopped).toBe(1);
  });

  it('preempts inspection with rename without exposing the previous response', async () => {
    const inspection = inspectWorkspace(workspace);
    const worker = FakeWorker.instances[0];
    const rename = previewSymbolRename(workspace, 'main.srp', 6, 'renamed');
    const renameWorker = FakeWorker.instances[1];
    expect(worker.stopped).toBe(1);
    expect((await inspection).ok).toBe(false);
    worker.send({ id: 1, inspection: { ok: true, files: [] } });
    expect(renameWorker.posted[0]).toMatchObject({
      id: 1, mode: 'rename', path: 'main.srp', offset: 6, new_name: 'renamed',
    });
    renameWorker.send({ id: 1, rename: { ok: false, error: 'No symbol at this position.' } });
    expect((await rename).ok).toBe(false);
    expect(renameWorker.stopped).toBe(1);
  });

  it('allows Check and Verify to share the same bounded lifecycle', async () => {
    const check = checkWorkspace(workspace);
    const first = FakeWorker.instances[0];
    const verify = verifyWorkspace(workspace);
    const second = FakeWorker.instances[1];
    expect(first.stopped).toBe(1);
    expect((await check).ok).toBe(false);
    expect(first.posted[0]).toMatchObject({ mode: 'check' });
    expect(second.posted[0]).toEqual({ id: 1, mode: 'verify', workspace });
    second.send({ id: 1, result: { ok: true, stdout: '', stderr: '' } });
    expect((await verify).ok).toBe(true);
    expect(second.stopped).toBe(1);
  });

  it('keeps definition navigation compatible with Run and later inspection', async () => {
    const definition = findDefinition(workspace, 'main.srp', 6);
    const first = FakeWorker.instances[0];
    const run = runWorkspace(workspace);
    const second = FakeWorker.instances[1];
    expect(first.stopped).toBe(1);
    expect((await definition).error).toContain('cancelled');
    second.send({ id: 1, result: { ok: true, stdout: '1\n', stderr: '' } });
    expect((await run).stdout).toBe('1\n');
    const inspection = inspectWorkspace(workspace);
    const third = FakeWorker.instances[2];
    third.send({ id: 1, inspection: { ok: false, error: 'No module inventory.' } });
    expect((await inspection).ok).toBe(false);
  });

  it('uses the same cancellation contract for all worker-based actions', async () => {
    const controller = new AbortController();
    controller.abort();
    const calls = [
      runWorkspace(workspace, controller.signal),
      checkWorkspace(workspace, controller.signal),
      verifyWorkspace(workspace, controller.signal),
      findDefinition(workspace, 'main.srp', 6, controller.signal),
      findReferences(workspace, 'main.srp', 6, controller.signal),
      previewSymbolRename(workspace, 'main.srp', 6, 'renamed', controller.signal),
      inspectSourceOutline(workspace, 'main.srp', controller.signal),
      inspectWorkspace(workspace, controller.signal),
    ];
    for (const result of await Promise.all(calls)) {
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toMatch(/cancelled/i);
    }
    expect(FakeWorker.instances).toHaveLength(0);
  });

  it('recovers from failed request transfer before a different operation', async () => {
    FakeWorker.crashOnPost = true;
    const failed = await findReferences(workspace, 'main.srp', 6);
    expect(failed.ok).toBe(false);
    expect(FakeWorker.instances[0].stopped).toBe(1);
    FakeWorker.crashOnPost = false;
    const check = checkWorkspace(workspace);
    FakeWorker.instances[1].send({ id: 1, result: { ok: true, stdout: '', stderr: '' } });
    expect((await check).ok).toBe(true);
  });

  it('does not allow stale navigation output to resolve a superseding Check', async () => {
    const refs = findReferences(workspace, 'main.srp', 6);
    const original = FakeWorker.instances[0];
    const check = checkWorkspace(workspace);
    const latest = FakeWorker.instances[1];
    original.send({ id: 1, references: { ok: true, symbol: null, declaration: null, references: [], truncated: false } });
    latest.send({ id: 2, result: { ok: true, stdout: '', stderr: '' } });
    expect(latest.stopped).toBe(0);
    latest.send({ id: 1, result: { ok: true, stdout: '', stderr: '' } });
    expect((await refs).ok).toBe(false);
    expect((await check).ok).toBe(true);
    expect(latest.stopped).toBe(1);
  });
});
