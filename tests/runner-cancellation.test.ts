import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { checkWorkspace, runWorkspace } from '../src/runner/client';
import type { RunResponse } from '../src/runner/types';

const workspace = { entry: 'main.srp', files: { 'main.srp': 'print("hello");' } };

class FakeWorker {
  static instances: FakeWorker[] = [];
  static failPost = false;
  static failConstruction = false;
  onmessageerror: (() => void) | null = null;
  onmessage: ((event: MessageEvent<RunResponse>) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  terminated = 0;
  posted: unknown[] = [];

  constructor() {
    if (FakeWorker.failConstruction) throw new Error('Worker startup denied');
    FakeWorker.instances.push(this);
  }
  terminate() { ++this.terminated; }
  postMessage(payload: unknown) {
    if (FakeWorker.failPost) throw new Error('Clone failed');
    this.posted.push(payload);
  }
  send(response: RunResponse) {
    this.onmessage?.({ data: response } as MessageEvent<RunResponse>);
  }
}

beforeEach(() => {
  FakeWorker.instances = [];
  FakeWorker.failPost = false;
  FakeWorker.failConstruction = false;
  vi.stubGlobal('Worker', FakeWorker);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('disposable compiler worker cancellation', () => {
  it('routes checking through the isolated worker without mixing it with running', async () => {
    const pending = checkWorkspace(workspace);
    const worker = FakeWorker.instances[0];
    expect(worker.posted[0]).toEqual({ id: 1, workspace, mode: 'check' });
    worker.send({ id: 1, result: { ok: true, stdout: '', stderr: '' } });
    expect(await pending).toEqual({ ok: true, stdout: '', stderr: '' });
    expect(worker.terminated).toBe(1);
  });

  it('aborts an in-flight check and discards its late response', async () => {
    const controller = new AbortController();
    const pending = checkWorkspace(workspace, controller.signal);
    const worker = FakeWorker.instances[0];
    controller.abort();
    expect((await pending).error).toMatch(/cancelled/);
    worker.send({ id: 1, result: { ok: true, stdout: 'stale\\n', stderr: '' } });
    expect(worker.terminated).toBe(1);
  });

  it('terminates immediately on source invalidation and ignores late worker responses', async () => {
    const controller = new AbortController();
    const pending = runWorkspace(workspace, controller.signal);
    const worker = FakeWorker.instances[0];
    expect(worker.posted).toHaveLength(1);
    controller.abort();
    const result = await pending;
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/cancelled/);
    expect(worker.terminated).toBe(1);
    worker.send({ id: 1, result: { ok: true, stdout: 'stale\\n', stderr: '' } });
    expect(await pending).toEqual(result);
    expect(worker.terminated).toBe(1);
  });

  it('keeps real worker responses intact and terminates once', async () => {
    const controller = new AbortController();
    const pending = runWorkspace(workspace, controller.signal);
    const worker = FakeWorker.instances[0];
    const response = { ok: true, stdout: 'hello\\n', stderr: '' };
    worker.send({ id: 1, result: response });
    expect(await pending).toEqual(response);
    controller.abort();
    expect(worker.terminated).toBe(1);
  });

  it('handles a malformed worker response without hanging or displaying it', async () => {
    const pending = runWorkspace(workspace);
    const worker = FakeWorker.instances[0];
    worker.send({ id: 1, result: { ok: 'not a boolean' } } as unknown as RunResponse);
    expect((await pending).error).toMatch(/Invalid or oversized/);
    expect(worker.terminated).toBe(1);
  });

  it('handles a browser worker message decoding error and terminates once', async () => {
    const pending = runWorkspace(workspace);
    const worker = FakeWorker.instances[0];
    worker.onmessageerror?.();
    expect((await pending).error).toMatch(/could not decode/);
    expect(worker.terminated).toBe(1);
  });

  it('handles a synchronous postMessage cloning exception without leaking a worker', async () => {
    FakeWorker.failPost = true;
    const response = await runWorkspace(workspace);
    expect(response.error).toMatch(/Unable to send/);
    expect(FakeWorker.instances[0].terminated).toBe(1);
  });

  it('handles Worker constructor failure without rejecting the execution promise', async () => {
    FakeWorker.failConstruction = true;
    const result = await runWorkspace(workspace);
    expect(result).toEqual({
      ok: false, stdout: '', stderr: '',
      error: 'Unable to start the Scarp compiler worker in this browser.',
    });
    expect(FakeWorker.instances).toHaveLength(0);
    FakeWorker.failConstruction = false;
    const recovered = runWorkspace(workspace);
    FakeWorker.instances[0].send({
      id: 1, result: { ok: true, stdout: 'recovered\\n', stderr: '' },
    });
    expect((await recovered).stdout).toBe('recovered\\n');
  });

  it('enforces the 12-second browser deadline and permits a clean subsequent run', async () => {
    vi.useFakeTimers();
    const pending = runWorkspace(workspace);
    const first = FakeWorker.instances[0];
    await vi.advanceTimersByTimeAsync(12_000);
    const expired = await pending;
    expect(expired.ok).toBe(false);
    expect(expired.error).toMatch(/12-second browser limit/);
    expect(first.terminated).toBe(1);
    first.send({ id: 1, result: { ok: true, stdout: 'late\\n', stderr: '' } });
    expect(await pending).toEqual(expired);

    const recovered = runWorkspace(workspace);
    const next = FakeWorker.instances[1];
    next.send({ id: 1, result: { ok: true, stdout: 'ready\\n', stderr: '' } });
    expect((await recovered).stdout).toBe('ready\\n');
    expect(next.terminated).toBe(1);
  });

  it('avoids constructing a worker for a pre-aborted request', async () => {
    const controller = new AbortController();
    controller.abort();
    expect((await runWorkspace(workspace, controller.signal)).error).toMatch(/cancelled/);
    expect(FakeWorker.instances).toHaveLength(0);
  });
});
