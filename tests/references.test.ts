import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { decodeReferencesReply, findReferences, MAX_REFERENCE_RESULTS } from '../src/navigation/references';

const source = {
  entry: 'main.srp', files: { 'main.srp': 'bind answer = 42; print(answer);' },
};
const where = { path: 'main.srp', start: { line: 1, column: 6 },
  end: { line: 1, column: 12 } };
const good = {
  ok: true, symbol: { name: 'answer', kind: 'binding' }, declaration: where,
  references: [{ ...where, kind: 'read' }], truncated: false,
};

describe('compiler-backed Find References response', () => {
  it('accepts bounded compiler sites and an explicitly absent symbol', () => {
    expect(decodeReferencesReply(JSON.stringify(good))).toEqual(good);
    expect(decodeReferencesReply(JSON.stringify({
      ok: true, symbol: null, declaration: null, references: [], truncated: false,
    }))).toMatchObject({ ok: true, symbol: null });
  });
  it('rejects malformed, oversized or unsafe response fields', () => {
    for (const bad of [
      'not JSON',
      JSON.stringify({ ...good, declaration: { ...where, path: '../outside.srp' } }),
      JSON.stringify({ ...good, symbol: { name: 'x'.repeat(257), kind: 'binding' } }),
      JSON.stringify({ ...good, references: Array(MAX_REFERENCE_RESULTS + 1).fill(good.references[0]) }),
      JSON.stringify({ ...good, references: [{ ...good.references[0], start: { line: 0, column: 2 } }] }),
      JSON.stringify({ ...good, references: [{ ...good.references[0], kind: 37 }] }),
      JSON.stringify({ ...good, truncated: 'no' }),
      JSON.stringify({ ok: true, symbol: null, declaration: where, references: [], truncated: false }),
    ]) {
      expect(decodeReferencesReply(bad)).toMatchObject({
        ok: false, error: expect.stringContaining('Invalid or oversized'),
      });
    }
  });
});

class FakeWorker {
  static instances: FakeWorker[] = [];
  posted: unknown[] = [];
  terminated = 0;
  onmessage: ((e: MessageEvent<{ id: number; references: unknown }>) => void) | null = null;
  onmessageerror: (() => void) | null = null;
  onerror: ((e: ErrorEvent) => void) | null = null;
  constructor() { FakeWorker.instances.push(this); }
  postMessage(message: unknown) { this.posted.push(message); }
  terminate() { this.terminated++; }
  send(result: unknown) {
    this.onmessage?.({ data: { id: 1, references: result } } as MessageEvent<{id: number; references: unknown}>);
  }
}
beforeEach(() => { FakeWorker.instances = []; vi.stubGlobal('Worker', FakeWorker); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('disposable Find References worker', () => {
  it('selects compiler-only mode and terminates when done', async () => {
    const pending = findReferences(source, 'main.srp', 7);
    const worker = FakeWorker.instances[0];
    expect(worker.posted).toEqual([{ id: 1, workspace: source, mode: 'references', path: 'main.srp', offset: 7 }]);
    worker.send(good);
    expect(await pending).toEqual(good);
    expect(worker.terminated).toBe(1);
  });
  it('rejects invalid workspace paths without allocating a worker', async () => {
    expect((await findReferences(source, '../secret.srp', 0)).ok).toBe(false);
    expect(FakeWorker.instances).toHaveLength(0);
  });
  it('cancels promptly and ignores stale references', async () => {
    const controller = new AbortController();
    const pending = findReferences(source, 'main.srp', 8, controller.signal);
    const worker = FakeWorker.instances[0];
    controller.abort();
    expect((await pending).ok).toBe(false);
    worker.send(good);
    expect(worker.terminated).toBe(1);
  });
});
