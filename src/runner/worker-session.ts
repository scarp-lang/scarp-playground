import { RUN_TIMEOUT_MS } from './limits';
import { claimCompilerWorker } from './worker-slot';

/**
 * The lifecycle of a single compiler request. None of these strings contains
 * program input, source code or a raw Worker exception: worker errors are not
 * safe to display to the editor user.
 */
export type WorkerSessionErrors = Readonly<{
  cancelled: string;
  startup: string;
  timeout: string;
  crashed: string;
  unreadable: string;
  send: string;
}>;

export type WorkerSessionOptions<Request extends { id: number }, Result> = Readonly<{
  request: Request;
  signal?: AbortSignal;
  errors: WorkerSessionErrors;
  failure: (error: string) => Result;
  /** The reply has the expected request id; its remaining fields are untrusted. */
  decode: (reply: Record<string, unknown>) => Result;
}>;

function isReply(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Start one dedicated, disposable Rust/WASM compiler Worker.
 *
 * This function intentionally owns all six terminal paths: response, user
 * abort, capacity preemption, deadline, worker failure and postMessage failure.
 * A completed request always releases the compiler slot, and a late message or
 * late abort can never settle its promise again or release a newer owner's slot.
 *
 * Callers must validate their request *before* entering this function, and
 * decode/validate the untrusted reply with their operation-specific protocol.
 */
export function invokeCompilerWorker<Request extends { id: number }, Result>(
  options: WorkerSessionOptions<Request, Result>,
): Promise<Result> {
  const { request, signal, errors, failure, decode } = options;
  if (signal?.aborted) return Promise.resolve(failure(errors.cancelled));

  return new Promise(resolve => {
    let worker: Worker | undefined;
    let finished = false;
    let deadline: ReturnType<typeof setTimeout> | undefined;
    let releaseSlot: () => void = () => {};

    const complete = (answer: Result): void => {
      if (finished) return;
      finished = true;
      if (deadline !== undefined) clearTimeout(deadline);
      signal?.removeEventListener('abort', abort);
      // Browser Worker.terminate() is specified to be synchronous, but a
      // broken test double must not prevent releasing the global slot.
      try { worker?.terminate(); } catch { /* Cleanup still must finish. */ }
      releaseSlot();
      resolve(answer);
    };
    const abort = (): void => complete(failure(errors.cancelled));

    // Claim the capacity before constructing a new Worker. The previous
    // owner's cancellation is synchronous and cannot release this new slot.
    releaseSlot = claimCompilerWorker(abort);
    try {
      worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
    } catch {
      complete(failure(errors.startup));
      return;
    }

    const activeWorker = worker;
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) {
      abort();
      return;
    }

    deadline = setTimeout(() => complete(failure(errors.timeout)), RUN_TIMEOUT_MS);
    activeWorker.onerror = event => {
      event.preventDefault();
      complete(failure(errors.crashed));
    };
    activeWorker.onmessageerror = () => complete(failure(errors.unreadable));
    activeWorker.onmessage = (event: MessageEvent<unknown>) => {
      const reply = event.data;
      if (finished || !isReply(reply) || reply.id !== request.id) return;
      try {
        complete(decode(reply));
      } catch {
        // Never surface raw errors or source-bearing exceptions from a
        // corrupted worker response or a caller's decoding callback.
        complete(failure(errors.unreadable));
      }
    };
    try {
      activeWorker.postMessage(request);
    } catch {
      complete(failure(errors.send));
    }
  });
}
