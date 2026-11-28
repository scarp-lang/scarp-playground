import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { invokeCompilerWorker, type WorkerSessionErrors } from '../src/runner/worker-session';

const errors: WorkerSessionErrors = {
  cancelled: 'Session cancelled.',
  startup: 'Worker startup failed.',
  timeout: 'Worker timed out.',
  crashed: 'Worker crashed.',
  unreadable: 'Unreadable reply.',
  send: 'Message transfer failed.',
};
type Result = { ok: true; value: number } | { ok: false; error: string };
const failure = (error: string): Result => ({ ok: false, error });
const request = { id: 1, mode: 'verify' as const, workspace: { entry: 'main.srp', files: { 'main.srp': 'print(1);' } } };
const decode = (reply: Record<string, unknown>): Result => {
  if (typeof reply.value !== 'number' || !Number.isSafeInteger(reply.value)) {
    return failure('Invalid result.');
  }
  return { ok: true, value: reply.value };
};
const execute = (signal?: AbortSignal) => invokeCompilerWorker({
  request, signal, errors, failure, decode,
});

class FakeWorker {
  static instances: FakeWorker[] = [];
  static startError = false;
  static sendError = false;
  static stopError = false;
  static afterConstruction: (() => void) | null = null;
  onmessage: ((event: MessageEvent<unknown>) => void) | null = null;
  onmessageerror: (() => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  posted: unknown[] = [];
  stops = 0;
  constructor() {
    if (FakeWorker.startError) throw new Error('private startup exception');
    FakeWorker.instances.push(this);
    FakeWorker.afterConstruction?.();
  }
  postMessage(message: unknown) {
    if (FakeWorker.sendError) throw new Error('private source in send exception');
    this.posted.push(message);
  }
  terminate() {
    this.stops++;
    if (FakeWorker.stopError) throw new Error('broken terminate');
  }
  emit(message: unknown) {
    this.onmessage?.({ data: message } as MessageEvent<unknown>);
  }
  crash() {
    const event = { preventDefault: vi.fn() } as unknown as ErrorEvent;
    this.onerror?.(event);
    return event;
  }
}

beforeEach(() => {
  FakeWorker.instances = [];
  FakeWorker.startError = false;
  FakeWorker.sendError = false;
  FakeWorker.stopError = false;
  FakeWorker.afterConstruction = null;
  vi.stubGlobal('Worker', FakeWorker);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('shared compiler Worker lifecycle', () => {
  it('uses one module Worker, forwards exactly the request and terminates once', async () => {
    const pending = execute();
    const worker = FakeWorker.instances[0];
    expect(worker.posted).toEqual([request]);
    worker.emit({ id: 1, value: 7 });
    expect(await pending).toEqual({ ok: true, value: 7 });
    worker.emit({ id: 1, value: 9 });
    worker.crash();
    expect(await pending).toEqual({ ok: true, value: 7 });
    expect(worker.stops).toBe(1);
  });

  it('does not construct a Worker when the signal was already aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    expect(await execute(controller.signal)).toEqual(failure(errors.cancelled));
    expect(FakeWorker.instances).toHaveLength(0);
  });

  it('handles an abort during the Worker constructor without posting a message', async () => {
    const controller = new AbortController();
    FakeWorker.afterConstruction = () => controller.abort();
    expect(await execute(controller.signal)).toEqual(failure(errors.cancelled));
    expect(FakeWorker.instances[0].posted).toHaveLength(0);
    expect(FakeWorker.instances[0].stops).toBe(1);
  });

  it('ignores stale ids, invalid envelopes and arbitrary mode fields', async () => {
    const pending = execute();
    const worker = FakeWorker.instances[0];
    worker.emit(null);
    worker.emit([]);
    worker.emit('raw text');
    worker.emit({ id: 2, value: 8 });
    worker.emit({ id: undefined, value: 10 });
    expect(worker.stops).toBe(0);
    worker.emit({ id: 1, value: 12, irrelevant: { data: 'not forwarded' } });
    expect(await pending).toEqual({ ok: true, value: 12 });
    expect(worker.stops).toBe(1);
  });

  it('decodes only the matching response and never forwards malformed data', async () => {
    const pending = execute();
    FakeWorker.instances[0].emit({ id: 1, value: 'forged' });
    expect(await pending).toEqual(failure('Invalid result.'));
  });

  it('returns a generic message if an unexpected decoder exception includes source', async () => {
    const pending = invokeCompilerWorker({
      request, errors, failure,
      decode: () => { throw new Error('private source: print(secret);'); },
    });
    FakeWorker.instances[0].emit({ id: 1, value: 4 });
    const result = await pending;
    expect(result).toEqual(failure(errors.unreadable));
    expect(JSON.stringify(result)).not.toMatch(/secret/);
  });

  it('preempts the previous Worker synchronously and ignores its late reply', async () => {
    const previous = execute();
    const oldWorker = FakeWorker.instances[0];
    const next = execute();
    const currentWorker = FakeWorker.instances[1];
    expect(oldWorker.stops).toBe(1);
    expect(await previous).toEqual(failure(errors.cancelled));
    oldWorker.emit({ id: 1, value: 888 });
    currentWorker.emit({ id: 1, value: 42 });
    expect(await next).toEqual({ ok: true, value: 42 });
    expect(currentWorker.stops).toBe(1);
  });

  it('does not let cleanup from the first request release a newer slot', async () => {
    const first = execute();
    const firstWorker = FakeWorker.instances[0];
    const second = execute();
    const secondWorker = FakeWorker.instances[1];
    firstWorker.emit({ id: 1, value: 0 });
    const third = execute();
    const thirdWorker = FakeWorker.instances[2];
    expect(await first).toEqual(failure(errors.cancelled));
    expect(await second).toEqual(failure(errors.cancelled));
    expect(secondWorker.stops).toBe(1);
    thirdWorker.emit({ id: 1, value: 3 });
    expect(await third).toEqual({ ok: true, value: 3 });
  });

  it('enforces the shared deadline, discards late output and permits recovery', async () => {
    vi.useFakeTimers();
    const pending = execute();
    const worker = FakeWorker.instances[0];
    await vi.advanceTimersByTimeAsync(12_000);
    expect(await pending).toEqual(failure(errors.timeout));
    worker.emit({ id: 1, value: 10 });
    expect(worker.stops).toBe(1);
    const next = execute();
    FakeWorker.instances[1].emit({ id: 1, value: 11 });
    expect(await next).toEqual({ ok: true, value: 11 });
  });

  it('handles Worker startup, transfer, message decoding and crash failures', async () => {
    FakeWorker.startError = true;
    expect(await execute()).toEqual(failure(errors.startup));
    FakeWorker.startError = false;

    FakeWorker.sendError = true;
    expect(await execute()).toEqual(failure(errors.send));
    expect(FakeWorker.instances.at(-1)?.stops).toBe(1);
    FakeWorker.sendError = false;

    const decoding = execute();
    FakeWorker.instances.at(-1)?.onmessageerror?.();
    expect(await decoding).toEqual(failure(errors.unreadable));

    const crashing = execute();
    const active = FakeWorker.instances.at(-1)!;
    const event = active.crash();
    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(await crashing).toEqual(failure(errors.crashed));
    expect(active.stops).toBe(1);
  });

  it('releases the capacity even if termination itself throws', async () => {
    FakeWorker.stopError = true;
    const current = execute();
    FakeWorker.instances[0].emit({ id: 1, value: 1 });
    expect(await current).toEqual({ ok: true, value: 1 });
    FakeWorker.stopError = false;
    const next = execute();
    FakeWorker.instances[1].emit({ id: 1, value: 2 });
    expect(await next).toEqual({ ok: true, value: 2 });
  });

  it('removes abort listeners when a response completes and aborts only the active worker', async () => {
    const controller = new AbortController();
    const old = execute(controller.signal);
    const oldWorker = FakeWorker.instances[0];
    oldWorker.emit({ id: 1, value: 1 });
    expect(await old).toEqual({ ok: true, value: 1 });
    const next = execute();
    const nextWorker = FakeWorker.instances[1];
    controller.abort();
    expect(nextWorker.stops).toBe(0);
    nextWorker.emit({ id: 1, value: 2 });
    expect(await next).toEqual({ ok: true, value: 2 });
  });
});
