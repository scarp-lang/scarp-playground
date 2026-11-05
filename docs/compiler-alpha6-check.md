# Scarp v0.0.6-alpha.1 browser integration candidate — 2026-11-05

## Compiler provenance

- Upstream repository: https://github.com/scarp-lang/scarp
- Published upstream prerelease: [v0.0.6-alpha.1](https://github.com/scarp-lang/scarp/releases/tag/v0.0.6-alpha.1)
- Annotated tag object: `6b773761e684bb74b69a58363607639241b6824b`
- Tag peels to immutable source commit: `aa329a22cf2bf92d2c9814a26ff9c8b67a72e6e8`
- Previous Playground pin (v0.0.5-alpha.4): `79141329176f5dce51457e90a6652902f6432135`
- The Git revision in `bridge/Cargo.toml` and the `scarp` package entry in
  `bridge/Cargo.lock` must match exactly. Neither follows moving `main`.

The comparison contains 106 commits. Library changes introduce opt-in navigation
indexing (`modules::compile_indexed_with_loader` / `symbols`) and an RMS
numeric intrinsic. Existing `MemorySourceLoader`, `ModuleLimits`,
`compile_with_loader`, `ModuleProgram::execute` and `ModuleRunError`
contracts remain usable; `ModuleProgram::check` is used for check-only mode.
The index is **not** integrated in this change and must not be advertised as a
working browser feature.

## Check mode contract

`check(request_json)` is a new exported WebAssembly entrypoint parallel to
`execute(request_json)`. Both share the same request envelope, virtual file
path validation, module limits and `ExecutionOptions`. The check path invokes
the upstream `ModuleProgram::check`, which evaluates selected code paths
without writing program output. A successful check returns
`{ "ok": true, "stdout": "", "stderr": "" }`. Failures retain the
existing schema-v1 structured diagnostic, original filename, Unicode-scalar
positions and empty output streams. **Check is not a pure parse-only pass**:
runtime errors and work-budget exhaustion are detected. It is not a static
guarantee about all unselected branches.

The browser protocol carries an explicit `mode: "run" | "check"`. Every
request runs in a disposable worker, has the existing 12-second wall-clock
termination, and is invalidated if source or entrypoint changes. The worker
chooses the exported Rust entrypoint; JavaScript does not pretend to validate
Scarp syntax.

## Security and capability boundaries

All files are still in the bounded `MemorySourceLoader`, not on a host disk or
remote server. The current cap is 12 source files, 64 KiB per file, 128 KiB total
source, 1 MiB JSON request, 200,000 interpreter work steps, 1,000 print
statements, 10,000 calls, 64 frames, 1 MiB captured output and capped numeric
and text allocation. Both check and run use these same quotas. Browser worker
termination is not a hard WASM process-memory cap. Do not describe this as a
production-grade sandbox; do not paste secrets.

## Release acceptance

Before merging into `main`, require independent green results from:
1. `cargo test --locked --manifest-path bridge/Cargo.toml`, including the
   real compiler check/run separation, imported-module diagnostics, budget
   exhaustion and the new RMS intrinsic.
2. `wasm-pack build bridge --release --target web --out-dir ../public/compiler --locked`.
3. `npm run lint`, `npm run typecheck`, `npm run test`,
   `npm run build` and static WASM asset verification.
4. Real Chromium Playwright regression tests for both Check and Run, imports,
   diagnostics, Unicode mapping, execution cancellation and resource pressure.
5. A green `main` pipeline and Pages deployment after merging.

Updating `main` must not rewrite immutable Playground v0.0.1 or v0.0.2
pre-release archives. This integration is **not** authorization to publish
a stable Playground release. A future v0.0.3 pre-release needs its own release
gate and immutable build/artifact verification.
