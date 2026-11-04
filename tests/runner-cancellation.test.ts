import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runWorkspace } from '../src/runner/client';
import type { RunResponse } from '../src/runner/types';

const workspace = { entry: 'main.srp', files: { 'main.srp': 'print("hello");' } };

class FakeWorker {
  static instances: FakeWorker[] = [];
  onmessage: ((event: MessageEvent<RunResponse>) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  terminated = 0;
  posted: unknown[] = [];

  constructor() { FakeWorker.instances.push(this); }
  terminate() { ++this.terminated; }
  postMessage(payload: unknown) { this.posted.push(payload); }
  send(response: RunResponse) {
    this.onmessage?.({ data: response } as MessageEvent<RunResponse>);
  }
}

beforeEach(() => {
  FakeWorker.instances = [];
  vi.stubGlobal('Worker', FakeWorker);
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('disposable compiler worker cancellation', () => {
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

  it('avoids constructing a worker for a pre-aborted request', async () => {
    const controller = new AbortController();
    controller.abort();
    expect((await runWorkspace(workspace, controller.signal)).error).toMatch(/cancelled/);
    expect(FakeWorker.instances).toHaveLength(0);
  });
});
