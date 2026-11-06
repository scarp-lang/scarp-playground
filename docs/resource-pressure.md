# Resource-pressure regression suite

**Scope:** bounded, reproducible tests for the exact Scarp interpreter embedded
in the current development preview. They are a partial security-hardening
measure, **not a memory-safety certification** or a measurement of browser
process memory.

## Runtime ceilings under test

| Boundary | Configured value | Regression coverage |
| --- | --- | --- |
| Browser Worker wall-clock | 12 seconds | Fake-timer test verifies termination, stale reply ignored and next run succeeds |
| Worker construction | Browser-dependent | Constructor failure becomes a stable error; next run can still execute |
| Rust instructions | 200,000 steps | Existing E0017 loop test; vector/text stress can hit this first |
| Print/write statements | 1,000 selected | 1,200 selected print statements yield real E0018, no partial stdout |
| Active call depth | 64 | Recursive function yields real E0027, next program runs normally |
| Buffered output | 1 MiB | One 60 KiB string printed 20 times yields real E0029 and no leaked stdout |
| Cumulative numerical payload | 2 MiB | Large `fill` candidate verifies a bounded error, potentially E0017 before vector-budget exhaustion |
| Cumulative text payload | 2 MiB; per string 1 MiB | Large Unicode text repetition yields a bounded E0017 or E0048 and no partial output |
| Imported module depth | 8 | A 9-module import chain rejects before executing the entry program |
| Raw Rust request JSON | 1 MiB | Existing early rejection test |
| Source quota | 12 files, 64 KiB/file, 128 KiB total | Existing Rust and TypeScript guards |

The native tests use the **real** `modules::compile_with_loader` and
`ModuleProgram::execute` through `bridge/src/lib.rs` with the exact pinned
official compiler. `tests/e2e/resource-limits.spec.ts` independently checks
output, call-depth and capture failure **in the production Chromium browser**
under the actual Rust/WASM Worker, then checks recovery with a fresh Worker.

## One active compiler Worker (development hardening)

Run, Check and Go to Definition now share a single browser-side Worker
capacity slot. A newer valid request synchronously terminates the older
compiler Worker before constructing its own. Source changes and explicit
Stop actions continue to abort their Worker, while stale replies and
late cleanup cannot release the newer request's slot.

This prevents accidental **simultaneous compiler Workers** from a burst
of editor requests; it is not a strict WASM linear-memory cap, per-worker
heap budget or promise that a single hostile request cannot exhaust the
browser process. Unit tests verify Run-to-Definition, Definition-to-Check,
Run-to-Run preemption, ignored stale responses and stale lease cleanup.
The remaining physical-memory and fuzz-review gates in issue #3 are open.

## What the tests prove

- The compiler emits a **structured, source-aware diagnostic** for bounded
  failures rather than fabricated JavaScript output.
- When the interpreter's atomic evaluation stage fails, neither stdout nor
  stderr escapes to the caller.
- Failures do not poison a subsequent fresh workspace/Worker.
- A worker timeout or a failure to allocate/start a Worker resolves a
  controlled result rather than leaving a request indefinitely pending.
- The production GitHub Pages CSP, Monaco and real WASM execution must still
  pass the existing browser suite before deployment.

## What the tests do not prove

- These are **logical compiler quotas**, not a strict operating-system,
  WebAssembly linear-memory or browser process-memory cap.
- A failure can consume significant transient memory *before* a logical quota
  check. Browser OOM can terminate the entire page or process without allowing
  the 12-second timeout or a JavaScript catch handler to run.
- Text and numerical kernels each consume interpreter work as well as
  allocation budgets. A resource-stress scenario can legitimately hit E0017
  before reaching the corresponding payload limit. The tests accept only
  known bounded diagnostics and should not claim a separate quota fired when
  it did not.
- Tests do not simulate a real browser process OOM, OS-level memory pressure,
  deep fuzzer-generated code, or every upstream compiler panic site.
- No unrestricted external user source, host filesystem or network API is
  exposed by the Playground. This is not proof that the browser engine itself
  is secure.

## Cross-browser compatibility regression

The real browser smoke suite now runs the pinned Scarp WASM interpreter in
Chromium, Firefox and WebKit. Each verifies CSP behavior, imports, Unicode
diagnostics and recovery after a bounded output error. See
[browser compatibility](browser-compatibility.md). These are behavioral tests,
not proof of a browser process-memory quota or recovery from operating-system
OOM; issue #3 stays open.

## Follow-up criteria for security issue #3

Before any stable release, add independent browser-memory telemetry under
controlled resource ceilings, separate Chrome/Firefox/WebKit compatibility
testing, longer random/reproducible compiler fuzz suites, a dependency audit,
Worker-response-header isolation review and a documented incident/security
response procedure. Keep the independent security review gate open.
