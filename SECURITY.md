# Security policy

Scarp Playground is **experimental**. Browser user programs run via the
official interpreter compiled to WebAssembly, in a disposable Web Worker.

The worker is terminated on a 12-second deadline. Source bytes, virtual files,
imports, interpreter work, calls, output size and allocation budgets are
limited, but the browser does not enforce an independent strict memory cap.

Do not paste passwords, tokens, private code or sensitive information into
untrusted sites. This project has no remote code execution service and should
not add one without dedicated review.

Please open a non-sensitive security report through the repository's GitHub
security advisory interface rather than a public issue.

## Input and result protocol checks

The Rust bridge rejects raw JSON requests larger than **1 MiB** before
deserialization. The browser also validates a 128 KiB total source budget.
The disposable Worker rejects compiler replies larger than 8 MiB of raw JSON
text before parsing them. Worker and main-thread checks enforce a combined
1 MiB stdout/stderr UTF-8 limit and validate schema-1 diagnostic locations
before rendering. Invalid worker messages and cloning failures produce
controlled errors and worker termination.

## Production browser Content Security Policy

The GitHub Pages production build enforces a restrictive `Content-Security-Policy`
**meta tag** inserted before application scripts. It denies remote scripts,
inline JavaScript, unrestricted eval, remote Worker origins and cross-origin
network connections. Rust/WASM requires the narrowly scoped `wasm-unsafe-eval`
exception, and Monaco requires inline styles; these are not blanket permissions
for inline JavaScript or arbitrary dynamic code evaluation.

This is a static-hosting constraint, **not** a security boundary or full
HTTP-header policy. In particular, CSP meta cannot enforce `frame-ancestors`,
`sandbox` or HTTP report-only reporting. The Vite dev server intentionally
does not use the production policy. See
[the CSP review](docs/content-security-policy.md) for directives and tests.

## Cross-operation compiler Worker capacity

The Run, Check and Go to Definition browser clients share a single
active compiler Worker slot. Starting a different valid operation cancels
the previous one and terminates that Worker before allocating another.
Aborts, timeouts and failed starts release capacity; stale worker replies
are ignored. This limits concurrent WASM resource pressure but does not
bound the memory used by **one** Worker or guarantee survival of a browser OOM.

## Reproducible compiler mutation regressions

The native bridge runs a fixed-seed mutation corpus through the real pinned
Scarp compiler for Execute, Check and Go to Definition. It rejects panics,
malformed JSON replies, output-budget violations and any partial stdout/stderr
on a failed operation. The CI-gated Chromium regression additionally sends
malformed source through real WASM and verifies successful subsequent execution.
Read the [reproduction instructions](docs/deterministic-fuzzing.md) and
its explicit limitations. This is not coverage-guided fuzzing or a physical
browser-process memory limit.

## Resource-pressure recovery and regression tests

The official Rust/WASM interpreter is tested against its configured output
statement, buffered-output, call-depth and deterministic work ceilings, plus
bounded text, vector and nested-module stress scenarios. Tests assert that
failed evaluations produce no partial stdout/stderr and that a subsequent
program can execute normally. A browser-worker constructor failure returns
a controlled error, and fake-timer tests verify that the 12-second deadline
terminates the previous worker. The real Chromium tests exercise the actual
compiler, not synthetic responses. See
[resource-pressure methodology](docs/resource-pressure.md).

**These are not a hardened sandbox.** No independent process memory cap,
out-of-memory recovery guarantee, or browser-engine isolation guarantee is
provided. The 12-second timeout cannot stop arbitrary synchronous allocations.
Issue #3 continues to track CSP, memory stress, dependency and independent
security reviews.
