import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { findDefinition } from '../src/navigation/client';
import type { DefinitionResponse } from '../src/runner/types';

const workspace = {
  entry: 'main.srp',
  files: { 'main.srp': 'bind answer = 42; print(answer);' },
};

class FakeWorker {
  static instances: FakeWorker[] = [];
  onmessage: ((event: MessageEvent<DefinitionResponse>) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  onmessageerror: (() => void) | null = null;
  terminated = 0;
  posted: unknown[] = [];
  constructor() { FakeWorker.instances.push(this); }
  terminate() { ++this.terminated; }
  postMessage(payload: unknown) { this.posted.push(payload); }
  respond(result: DefinitionResponse) {
    this.onmessage?.({ data: result } as MessageEvent<DefinitionResponse>);
  }
}

beforeEach(() => { FakeWorker.instances = []; vi.stubGlobal('Worker', FakeWorker); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('disposable compiler definition workers', () => {
  it('uses an explicit definition mode, validates reply and terminates', async () => {
    const pending = findDefinition(workspace, 'main.srp', 7);
    const worker = FakeWorker.instances[0];
    expect(worker.posted).toEqual([{
      id: 1, workspace, mode: 'definition', path: 'main.srp', offset: 7,
    }]);
    worker.respond({ id: 1, definition: {
      ok: true, target: { path: 'main.srp',
        start: { line: 1, column: 6 }, end: { line: 1, column: 12 } },
    } });
    expect((await pending).ok).toBe(true);
    expect(worker.terminated).toBe(1);
  });

  it('cancels promptly and discards late navigation', async () => {
    const controller = new AbortController();
    const pending = findDefinition(workspace, 'main.srp', 7, controller.signal);
    const worker = FakeWorker.instances[0];
    controller.abort();
    const cancelled = await pending;
    expect(cancelled.error).toMatch(/cancelled/);
    worker.respond({ id: 1, definition: { ok: true, target: null } });
    expect(await pending).toEqual(cancelled);
    expect(worker.terminated).toBe(1);
  });

  it('rejects invalid file paths without starting a worker', async () => {
    const failed = await findDefinition(workspace, '../secret.srp', 0);
    expect(failed.ok).toBe(false);
    expect(FakeWorker.instances).toHaveLength(0);
  });

  it('times out a stuck worker without blocking new navigation', async () => {
    vi.useFakeTimers();
    const first = findDefinition(workspace, 'main.srp', 7);
    await vi.advanceTimersByTimeAsync(12_000);
    expect((await first).error).toMatch(/12-second/);
    expect(FakeWorker.instances[0].terminated).toBe(1);
    const next = findDefinition(workspace, 'main.srp', 7);
    FakeWorker.instances[1].respond({ id: 1, definition: { ok: true, target: null } });
    expect((await next).ok).toBe(true);
  });
});
