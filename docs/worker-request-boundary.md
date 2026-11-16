# Compiler Worker message and result boundaries

**Scope:** browser-side defense in depth for issue #3, using the official
published Scarp v0.0.6-alpha.11 compiler at
`79b57395957f47e1270ee542a856c844b82386de`.
This work does not authorize a stable release.

## Multiple checks before real WASM is loaded

1. **Main page:** Run, Check, Verify and navigation clients validate source
   workspaces and budgets before allocating a disposable Worker. The runtime
   validator rejects non-object workspaces, missing entrypoints, arrays as
   source maps, nonstring source, prototype-inherited entrypoints, traversal
   paths and oversized files. A TypeScript type assertion never substitutes
   for this runtime check.
2. **One-shot Worker:** the Worker accepts **one message** and validates its
   envelope before initializing the compiler module or invoking WASM:
   - request id must be `1` (the client's single-use id);
   - operation must be one of `run`, `check`, `verify`, `definition`,
     `references` or `rename`;
   - imported workspace structure must again meet the browser limits;
   - Run stdin must be a string within 16 KiB (UTF-8 bytes);
   - Check/Verify reject even an empty stdin field;
   - navigation must name an existing safe virtual file with a
     bounded integer byte offset; rename must contain a valid identifier;
   - unknown modes fail closed, **never fall back to Run**.
3. **Rust bridge:** independently caps JSON request size before parsing,
   validates the in-memory module graph and enforces interpreter limits.
   No host filesystem, shell or arbitrary program-network API is exposed.
4. **Output:** the Worker rejects oversized/malformed JSON replies before
   sending them to the main thread. The main thread separately validates
   structured-cloned replies. Failed Run responses must be atomic
   (no stdout or stderr); Check and Verify responses must always contain
   empty stdout/stderr. Contradictory success/error envelopes fail closed.

The rejection protocol returns a mode-specific, bounded failure response
to clients instead of leaving a valid request id hanging on a 12-second
timeout. Both invalid envelopes and ordinary compiler operations still
use the same single active Worker slot and cancellation/timeout control.

## Regression gates

- `tests/workspace.test.ts`: malformed source maps, overlong paths and
  prototype-inherited entrypoint rejection.
- `tests/runner-request.test.ts`: accepted request shapes and rejection
  of forged modes, UTF-8 oversize, malformed paths/offsets and rename names.
- `tests/runner-protocol.test.ts`: corrupted output, contradictory
  success and failure envelopes, UTF-8 and diagnostic ceilings.
- `tests/runner-cancellation.test.ts`: no Worker for malformed source,
  silent Check, cancellation and safe subsequent recovery.
- `tests/e2e/worker-boundary.spec.ts`: against the **real built Worker**
  in the browser, forged operation names and malformed navigation envelopes
  are rejected, then normal Rust/WASM execution recovers.

Locked frontend, native Rust, WebAssembly, Chromium, Firefox, WebKit and
dependency-security checks must pass for a merge and Pages deployment.

## Limitations

**This is protocol validation, not a hardened sandbox.** Source parsing and
constant evaluation can allocate memory within one Worker, and no process- or
WASM-linear-memory hard cap is provided. A browser engine/OOM crash or an
upstream compiler panic cannot be ruled out. The GitHub Pages response header
and Worker-specific CSP gap remains open; the main document's CSP meta policy
is not inherited by URL-loaded Workers. Independent adversarial security review
and stable-release approval are still required.
