# Official Scarp compiler integration audit — 2026-11-04

> Historical assessment dated November 4, 2026, for the **alpha.4 upgrade
> candidate**, not the current live Playground. As of November 5, the current
> compiler revision is **v0.0.6-alpha.1** at
> `aa329a22cf2bf92d2c9814a26ff9c8b67a72e6e8`. Refer to
> [alpha.6 integration](compiler-alpha6-check.md) and
> [Go to Definition](go-to-definition.md) for current capabilities.
> This document preserves the earlier v0.0.5-alpha.4 review.

## Exact upstream release and source

- Official compiler: https://github.com/scarp-lang/scarp
- Published upstream release: **v0.0.5-alpha.4**, November 3, 2026
- Annotated tag object: `c957ec8a12e40dae2e82665a73a2da79ed9b34de`
- Tag **peels to source commit**:
  `79141329176f5dce51457e90a6652902f6432135`
- Former Playground compiler pin: alpha.3 at
  `7715c28df09c7703b39e14fddb963275b25df476`.
- New candidate dependency: **alpha.4 source commit above** in both
  `bridge/Cargo.toml` and the resolved `bridge/Cargo.lock`. No branch
  or moving tag is used as the runtime source.

The comparison spans **56 intervening commits**. GitHub's per-file change
report shows modifications to `src/main.rs` and a new `src/project.rs`,
but no changed `src/lib.rs`, `src/modules/`, `src/limits.rs`, or
`src/diagnostics/json.rs`. The library embedding contracts below therefore
have no changed source diff between these exact revisions. The manifest
version changes from `0.0.5-alpha.3` to `0.0.5-alpha.4`; no new Cargo
runtime dependency is introduced.

## APIs used in the WebAssembly bridge

The browser still uses only:

- `MemorySourceLoader::new` and `MemorySourceLoader::insert`
- `ModuleLimits`, `modules::compile_with_loader`
- `ModuleProgram::execute` with bounded `ExecutionOptions`
- `ModuleDiagnostic::write_json` and real interpreter stdout/stderr

The unchanged structured diagnostic contract is schema 1:

- `schema_version = 1`, real `code`, `severity`, `message`, optional `help`
- `span_encoding = utf-8-bytes` (half-open source spans)
- `column_encoding = unicode-scalar`, `position_base = 1`
- `primary` and `related` locations identify the virtual source-file path

Monaco uses UTF-16 columns. The Playground maps Unicode scalar positions
to UTF-16 per file, including after non-BMP characters. It never infers
diagnostics from a fake JavaScript parser.

## Browser vs host CLI feature boundary

Alpha.4 adds the **offline `Scarp.project` CLI** create/launch/verify
workflow. Those commands operate on the host's project directories. The
Playground provides **in-memory virtual .srp files** and optionally
downloads/reads browser-local portable workspace JSON; it does not offer
operating-system filesystem, network services, or host process execution.
The JSON workspace export is **not** a `Scarp.project` manifest.

Do not claim host-project CLI interoperability merely because the embedded
interpreter shares the alpha.4 source revision. Designing a virtual
`Scarp.project` representation requires its own spec, security boundary,
and compiler integration tests.

## Exact acceptance gates for this upgrade

This branch is not authorized to ship solely by comparing source files.
GitHub Actions must independently pass:

1. Locked `cargo test --locked --manifest-path bridge/Cargo.toml`, including
   real hello, multi-file import, imported-module E0010 JSON, Unicode
   diagnostic coordinates, and E0017 budget-limit checks.
2. `wasm-pack build bridge --release --target web --locked`, using the
   exact Git source revision.
3. Locked TypeScript lint, typecheck, frontend tests, optimized client build
   and emitted WebAssembly assets check.
4. The full headless Chromium suite executing the **real** compiled Rust
   interpreter, including import/diagnostic highlighting, Unicode source
   mapping, work budgets, cancellation, and local project import/export.
5. Successful post-merge main-branch build and Pages deployment.

The published `v0.0.1` GitHub Release remains unchanged and embeds alpha.3.
Playground **v1.0.0 stable is prohibited** until the compiler has an official
stable release and independent Playground security, accessibility,
compatibility and quality review passes. This alpha.4 update alone does not
satisfy that policy.
