# Scarp v0.0.6-alpha.3 — pinned browser integration review (2026-11-07)

## Release identity

- Official compiler: https://github.com/scarp-lang/scarp
- Published prerelease: https://github.com/scarp-lang/scarp/releases/tag/v0.0.6-alpha.3
- Publication: 2026-11-07 12:23:26 UTC; this is **not a stable release**.
- Annotated tag object: `c116498900ecf3bd227fc5eeb6ffc641822182f6`.
- Exact tag target/source: `ceff07d9014f466974e0c9e02fc5d23573f55777`.
- Previous Playground source pin: v0.0.6-alpha.2
  `398b8ff705154a02423fe458ce3a427401e81e31`.
- Native archives and checksum sidecars are compiler release assets, **not**
  a native compilation feature of Playground.

## Scope and compatibility

The published compiler adds the pure bounded numerical built-ins `topk`,
`topk_values`, `softmax_temp` and `logsoftmax_temp`. Its
`examples/topk_scores.srp` and `examples/temperature_softmax.srp`
have precise stdout fixtures in the released compiler source.

Playground continues to use the published Rust library through a pinned Git
revision with `MemorySourceLoader`, `compile_with_loader`,
`ModuleProgram::execute`/`check` and `compile_indexed_with_loader`.
There is no backend service, package manager, host filesystem, source
networking or persistent Rust compiler cache.

Alpha.3 introduces private typed scalar IR and validation for an
experimental restricted C11 emitter. These are **not** a general native
object compiler, a public build CLI or a browser native execution backend.
Playground still uses the ordinary interpreter in short-lived WASM Workers.

## Regression requirements

The integration branch must pass the established CI gates and new tests:

1. `bridge/Cargo.toml`, `bridge/Cargo.lock` and the independent provenance
   guard all agree on immutable `ceff07d9014f466974e0c9e02fc5d23573f55777`, version v0.0.6-alpha.3.
2. Native Rust tests run both exact-output upstream programs through the
   real interpreter. `check` remains silent, while invalid Top-K counts and
   temperatures yield E0033/E0034 without partial stdout.
3. A `wasm-pack --locked` release build succeeds; real Chromium runs both
   programs and recovers after an invalid-temperature error.
4. Existing lint, typechecking, JS unit tests, npm/RustSec dependency audits
   and Chromium/Firefox/WebKit browser suites remain green.
5. After review and merge, verify the separate `main` workflow and
   successful Pages deployment.

## Security and release constraints

No synthetic JavaScript substitute for compiler functions, Worker origin
relaxation, CSP change, or new release tag is introduced. WASM execution
retains the existing 12-second Worker timeout and logical source,
execution, output and allocation budgets; these are **not** a hard physical
browser memory quota. Independent OOM/Worker-header and security-review
work in [issue #3](https://github.com/scarp-lang/scarp-playground/issues/3)
remains open.

The immutable Playground v0.0.1 and v0.0.2 archives are historical releases
and must not be rewritten. This integration is not a stable-v1.0.0 release
authorization.
