# Browser memory-pressure observations — Chromium

**Status:** development-preview diagnostic regression, November 6, 2026.

This is a bounded, repeatable **measurement** of the real Rust Scarp
`v0.0.6-alpha.2` compiler running in a Chromium WebAssembly Worker.
It does not intentionally exhaust host memory, bypass compiler quotas or
claim that Worker termination prevents an operating-system out-of-memory
condition.

## What the test does

`tests/e2e/memory-pressure.spec.ts` loads the production Vite build with
its real CSP and Monaco editor. In one browser document, it runs a sequence
of seven Scarp programs:

- A successful warm-up and recovery programs after each failure.
- A 1,200-statement output program rejected with `E0018`.
- A bounded text/output-pressure program rejected with `E0029`.
- A bounded recursive-call program rejected with `E0027`.

The browser never uses a fake interpreter or synthetic WASM response.
After every operation, the test waits for real compiler Worker termination
and records three independent observations:

| Measurement | Source and coverage |
| --- | --- |
| Started, terminated and peak active compiler Workers | Test-only instrumentation of `Worker.prototype.postMessage` / `terminate`, recognizing messages with Scarp workspace and Run/Check/Definition mode; ignores Monaco's unrelated Workers |
| Page JavaScript heap used bytes | Chromium DevTools Protocol `Performance.getMetrics` / `JSHeapUsedSize`; **does not include Worker JavaScript heap or WASM linear memory** |
| Chromium process resident-set observations | Chromium browser-level DevTools Protocol `SystemInfo.getProcessInfo`, then Linux `/proc/<pid>/status` `VmRSS`; sums RSS for accessible Chromium processes; may double-count shared physical pages |

The test enforces deterministic logical outcomes: successful recovery after
each rejected program, no partial stdout on bounded failure, exactly one
compiler Worker in flight, seven created compiler Workers and all seven
terminated. It records memory samples but **does not impose a made-up RSS
threshold**. Concurrent test projects, browser engine internals, allocator
retention, host load and memory page sharing would make such a threshold
an unreliable security assertion.

## Run and inspect the evidence

From a development checkout with Node dependencies, built real compiler
WASM in `public/compiler` and a production `dist` bundle:

```sh
npm run test:e2e -- tests/e2e/memory-pressure.spec.ts --project=chromium --workers=1
```

On Linux, the test writes `chromium-memory-pressure.json` within its
Playwright test output directory. GitHub Actions uploads this evidence
as the `chromium-memory-pressure-telemetry` artifact even though the
standard HTML/browser failure artifacts are kept separately. The
file reports an observation after editor load and after each of the seven
operations. It contains no user-provided source text or credentials.

On other operating systems or if Chromium's process enumeration is
unavailable, the RSS entry explicitly reports `available: false`; it
must not silently substitute a made-up value. Page JS heap samples may
also be `null` when unsupported. Worker lifecycle and real-output tests
remain mandatory regardless of metric availability.

## Unresolved safety boundaries

This is **not** measurement of per-Worker RSS, peak WASM linear memory,
peak transient virtual/physical memory, browser-wide unique memory,
GPU process use or the total system's physical memory footprint. A
sum of per-process RSS can count the same shared memory multiple times.
It is a diagnostic trend, not an enforceable ceiling.

A browser engine may crash before any telemetry or timeout handler can
run. Successful recovery from compiler-owned logical errors does not prove
recovery after an actual process OOM or Rust/WASM panic. GitHub Pages
cannot set Worker-specific response CSP headers for this project, and
the compiler Worker remains an experimental execution boundary.
Independent profiling, constrained-memory stress runs outside shared CI,
runtime threat review and hostile-input fuzzing are still required
before a stable release. See [security issue #3](https://github.com/scarp-lang/scarp-playground/issues/3).

The telemetry is intended to establish a **repeatable baseline with explicit
blind spots** rather than prematurely assert an absolute memory guarantee.
