import { describe, expect, it } from 'vitest';
import { ExecutionScope } from '../src/runner/execution-scope';

describe('workspace revision and compiler run lifetime', () => {
  it('accepts only the active run and prevents a second concurrent start', () => {
    const scope = new ExecutionScope();
    const first = scope.start()!;
    expect(scope.running).toBe(true);
    expect(scope.start()).toBeNull();
    expect(scope.isCurrent(first)).toBe(true);
    expect(scope.finish(first)).toBe(true);
    expect(scope.running).toBe(false);
    expect(scope.isCurrent(first)).toBe(false);
  });

  it('aborts an in-flight worker and discards its success or diagnostics after a source change', () => {
    const scope = new ExecutionScope();
    const old = scope.start()!;
    scope.invalidate();
    expect(old.controller.signal.aborted).toBe(true);
    expect(scope.isCurrent(old)).toBe(false);
    expect(scope.finish(old)).toBe(false);
    expect(scope.running).toBe(false);
    const current = scope.start()!;
    expect(scope.isCurrent(current)).toBe(true);
    expect(scope.finish(old)).toBe(false);
    expect(scope.isCurrent(current)).toBe(true);
    expect(scope.finish(current)).toBe(true);
  });

  it('treats an invalidation after a successful run as a new workspace revision', () => {
    const scope = new ExecutionScope();
    const run = scope.start()!;
    expect(scope.finish(run)).toBe(true);
    scope.invalidate();
    expect(scope.isCurrent(run)).toBe(false);
    expect(scope.running).toBe(false);
  });
});
