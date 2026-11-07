> Historical integration record for the November 6 alpha.2 pin. Current `main` uses
> [v0.0.6-alpha.3](compiler-alpha6-3-check.md). The original alpha.2
> source identity and test criteria below are preserved for audit.

# Scarp v0.0.6-alpha.2 — pinned browser integration review (2026-11-06)

## Verified upstream publication

- Official repository: https://github.com/scarp-lang/scarp
- **Published** prerelease: [v0.0.6-alpha.2](https://github.com/scarp-lang/scarp/releases/tag/v0.0.6-alpha.2)
- Published on November 6, 2026, at 11:03:46 UTC.
- Annotated tag Git object: `35b29eab2b5353bbdc4a777885a7516cea9b4124`.
- Tag **peels to immutable compiler source** `398b8ff705154a02423fe458ce3a427401e81e31`.
- Previous Playground compiler pin: v0.0.6-alpha.1 at
  `aa329a22cf2bf92d2c9814a26ff9c8b67a72e6e8`.
- Compiler release has 7 public assets (3 platform archives, 3 archive hash
  sidecars, and one combined SHA256SUMS). Its GitHub Release is public,
  `draft=false` and `prerelease=true`.
- Upstream source candidate is not the source of truth for release status.
  The published annotated tag and GitHub Releases API were checked before
  opening this integration.

## Compiler change and Playground runtime contract

Alpha.2 introduces *opt-in* bounded Rust embedding APIs for:
dependency-aware module invalidation, whole-graph semantic cache, per-source
token and syntax caches, edit preflight and source-scoped cache eviction.
The changes are largely compiler internal; they **do not add new Scarp source
syntax, native executable output, a language server, filesystem capabilities
or a browser cache by themselves**.

Playground intentionally continues to use its *cold* compiler APIs for each
disposable Worker, with no persistent Rust compiler cache:

- `MemorySourceLoader` with validated virtual paths and file/total bytes
- `compile_with_loader` for Run and Check
- `ModuleProgram::execute` and `ModuleProgram::check` with configured limits
- `compile_indexed_with_loader`, `SymbolIndex::goto_definition` and
  compiler-owned source locations for Go to Definition
- Structured schema-v1 diagnostics and Unicode source coordinate mapping

An opt-in source-level cache would require an explicit review of residency
budgets, source revision handling, eviction and cancellation before being
enabled in the browser. **This integration does not enable those caches**.
No new persistent compiler data is retained across Worker termination.

No new remote backend, native executable compilation, direct filesystem
access, code upload or CSP relaxation is introduced.

## Acceptance and release constraints

Update `bridge/Cargo.toml` and its locked `scarp` entry together to the
immutable source commit, and update the reviewed source/version in the lock
provenance gate. A moving `main` or a version-only tag is not acceptable.

Before merging to the Playground's `main`, require:

1. Lock provenance and tamper-detection tests; live high/critical npm audit.
2. `cargo test --locked --manifest-path bridge/Cargo.toml` including fresh
   module imports, edited source, check-only semantics, full native fuzz corpus,
   Unicode diagnostics, error rollback and real F12 definition indices.
3. `wasm-pack build bridge --release --target web --out-dir ../public/compiler --locked`.
4. TypeScript typechecking, lint, unit tests and production Vite output checks.
5. Real Chromium Playwright regression suite and Firefox/WebKit WASM+CSP
   compatibility cases.
6. Successful post-merge `main` build and GitHub Pages deployment.

Playground's published **v0.0.1** and **v0.0.2** release archives are
historical immutable artifacts. Updating the `main` browser preview does
not rewrite those tags, publish a new Playground prerelease or authorize
Playground v1.0.0 stable.

The historical [alpha.1 integration review](compiler-alpha6-check.md) is
preserved as a dated record. Its previous snapshot does not describe this
new compiler pin or a stable security boundary.
