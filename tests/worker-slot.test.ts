import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runWorkspace, checkWorkspace } from '../src/runner/client';
import { findDefinition } from '../src/navigation/client';
import { claimCompilerWorker } from '../src/runner/worker-slot';

const workspace = {
  entry: 'main.srp',
  files: { 'main.srp': 'bind answer = 42; print(answer);' },
};

class FakeWorker {
  static instances: FakeWorker[] = [];
  onmessage: ((event: MessageEvent<unknown>) => void) | null = null;
  onmessageerror: (() => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  terminated = 0;
  constructor() { FakeWorker.instances.push(this); }
  postMessage(_payload: unknown) {}
  terminate() { this.terminated += 1; }
  emit(data: unknown) { this.onmessage?.({ data } as MessageEvent<unknown>); }
}

beforeEach(() => {
  FakeWorker.instances = [];
  vi.stubGlobal('Worker', FakeWorker);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('single active Rust/WASM compiler worker', () => {
  it('preempts a running program before creating a definition worker', async () => {
    const old = runWorkspace(workspace);
    const firstWorker = FakeWorker.instances[0];
    const next = findDefinition(workspace, 'main.srp', 5);
    const secondWorker = FakeWorker.instances[1];
    expect(firstWorker.terminated).toBe(1);
    expect((await old).error).toMatch(/cancelled/);
    firstWorker.emit({ id: 1, result: { ok: true, stdout: 'stale', stderr: '' } });
    secondWorker.emit({ id: 1, definition: { ok: true, target: null } });
    expect(await next).toEqual({ ok: true, target: null });
    expect(secondWorker.terminated).toBe(1);
  });

  it('preempts a navigation query before beginning a check', async () => {
    const old = findDefinition(workspace, 'main.srp', 5);
    const navigationWorker = FakeWorker.instances[0];
    const next = checkWorkspace(workspace);
    const checkWorker = FakeWorker.instances[1];
    expect(navigationWorker.terminated).toBe(1);
    expect((await old).error).toMatch(/cancelled/);
    navigationWorker.emit({ id: 1, definition: { ok: true, target: null } });
    checkWorker.emit({ id: 1, result: { ok: true, stdout: '', stderr: '' } });
    expect(await next).toEqual({ ok: true, stdout: '', stderr: '' });
    expect(checkWorker.terminated).toBe(1);
  });

  it('preempts even two direct Run callers and allows immediate recovery', async () => {
    const first = runWorkspace(workspace);
    const firstWorker = FakeWorker.instances[0];
    const second = runWorkspace(workspace);
    const secondWorker = FakeWorker.instances[1];
    expect(firstWorker.terminated).toBe(1);
    expect((await first).error).toMatch(/cancelled/);
    secondWorker.emit({ id: 1, result: { ok: true, stdout: 'done\\n', stderr: '' } });
    expect((await second).stdout).toBe('done\\n');
    expect(secondWorker.terminated).toBe(1);
  });

  it('does not let stale release handles clear the current worker slot', () => {
    const oldCancel = vi.fn();
    const middleCancel = vi.fn();
    const latestCancel = vi.fn();
    const releaseOld = claimCompilerWorker(oldCancel);
    const releaseMiddle = claimCompilerWorker(middleCancel);
    expect(oldCancel).toHaveBeenCalledOnce();
    releaseOld(); // A late cleanup must not release the new slot.
    const releaseLatest = claimCompilerWorker(latestCancel);
    expect(middleCancel).toHaveBeenCalledOnce();
    releaseMiddle();
    releaseLatest();
    const releaseAfter = claimCompilerWorker(vi.fn());
    expect(latestCancel).not.toHaveBeenCalled();
    releaseAfter();
  });
});
