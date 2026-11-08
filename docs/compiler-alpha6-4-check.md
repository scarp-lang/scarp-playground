# Scarp v0.0.6-alpha.4 — WebAssembly integration candidate (2026-11-08)

## Provenance and release boundaries

The Scarp compiler's official [v0.0.6-alpha.4](https://github.com/scarp-lang/scarp/releases/tag/v0.0.6-alpha.4) is published from annotated tag source `f04be0758cbce405ddcdb229699b0ff83c09d207`. The Playground's bridge Cargo manifest and lockfile use this exact SHA in the **development candidate**. Older published Playground archives remain unchanged.

Alpha.4 adds sampled calculus (`sample_area`, `sample_cumulative_area`, `sample_slopes`) and `cosine_similarity`. The experimental ELF64 object emitter is a limited Rust-host API, **not** a browser native-code runtime or general compiler.

## Required pre-merge verification

1. Check Cargo metadata and lockfile consistency, then build the real pinned Scarp library with `--locked` for `wasm32-unknown-unknown` using `wasm-pack`.
2. Run the Playground TypeScript build, lint, unit tests, worker protocol and production CSP/browser end-to-end suite.
3. Add or execute browser-side exact-output tests for sampled-calculus, cumulative-area and cosine-similarity source fixtures from the tagged compiler; preserve inherited Top-K and temperature-softmax tests.
4. Verify module imports, Unicode diagnostics, cancellation, source budgets and browser-only execution continue to match the official interpreter. Fail closed if host-only APIs break the WASM build.

This document is an upgrade **proposal and verification checklist**, not a claim that the WASM build or browser tests have already passed. Do not publish a new Playground tag or release without independent authorization and green checks.
