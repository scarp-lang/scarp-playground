# Architecture and integration assessment — 2026-11-03

## What was inspected

- `scarp-lang/scarp-playground`: initially only `.gitignore` and Apache-2.0 license.
- Official compiler is **`scarp-lang/scarp`**, not `scarp-lang/scarp-lang`.
- Published compiler v0.0.5-alpha.3 commit
  `7715c28df09c7703b39e14fddb963275b25df476`.
- Public Rust APIs `scarp::modules::{MemorySourceLoader, compile_with_loader}`,
  `ModuleProgram::execute`, `ExecutionOptions`, `ModuleDiagnostic::write_json`.
- The Rust package has no third-party compiler dependencies and is not
  published to the Rust registry; a pinned Git dependency is required.

## Execution design

```text
React workspace (files + entrypoint)
  -> validate virtual paths / UTF-8 byte limits
  -> disposable browser Web Worker (12s wall-clock cutoff)
  -> wasm-pack JS glue / WebAssembly
  -> Rust bridge (JSON request and response)
  -> published Scarp module loader + parser + resolver + interpreter
  -> real stdout, stderr, diagnostic JSON
  -> terminal pane and source location display
```

A Rust-to-WASM build is technically plausible because the interpreter offers
a pure in-memory loader and explicit output writers. This remains a *build
hypothesis until GitHub Actions compiles and tests the actual artifact*, and
no client-side JavaScript parser or fake output is used as fallback. The user
receives a transparent error if the wasm engine cannot load.

`MemorySourceLoader` maps portable relative source paths into an isolated
in-memory map. It does not expose OS files. The code uses compiler module
diagnostic schema 1 (UTF-8 byte spans and 1-based Unicode-scalar columns).

## Known risks and limits

- Default Rust/WASM linear memory may grow independently of the compiler's
  logical execution quotas. Browser worker termination is the final timeout
  control, not a formal security boundary.
- Some Rust standard-library code paths may be unsupported on
  `wasm32-unknown-unknown`; CI is the gate for this assumption.
- Output is captured only after successful interpreter preparation, following
  the compiler's real semantics.
- GitHub Pages is static; server-side execution, shell access and persistent
  filesystem operations are intentionally absent.
- Package resolution currently uses npm semver ranges; a checked-in
  `package-lock.json` is required before release sign-off.
- Multi-file source is supported, but snippets only share one small file and
  projects do not persist across reloads.
- Monaco tokenization is an editor convenience; actual Scarp syntax is
  determined solely by the pinned compiler.

## Near-term milestones

1. Get green native Rust tests, wasm-pack build, TypeScript lint/test and
   GitHub Pages artifact checks for v0.0.1.
2. Verify actual browser execution on desktop/mobile and accessibility
   keyboard interaction.
3. Pin JS/Rust dependency locks and add automated end-to-end browser tests.
4. Add persistent virtual projects, multi-file compressed URL sharing with
   size limits, and workspace import/export.
5. Improve Monaco source diagnostics, editor decorations and inline help.
6. Consider stable compiler release separately; independent security review,
   tested module constraints and quality gates remain mandatory for v1.0.0.
