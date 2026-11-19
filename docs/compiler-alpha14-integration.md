# Scarp v0.0.6-alpha.14 Playground browser integration

> Historical integration note: these alpha.14 regression fixtures remain in the
> Playground after the newer [alpha.15 compiler pin](compiler-alpha15-integration.md).
> The source revision recorded below is the alpha.14 release, not the current pin.

**Published upstream prerelease:** https://github.com/scarp-lang/scarp/releases/tag/v0.0.6-alpha.14

**Annotated Git tag object:** `1942378190fac68845563478c6e64d00d8b7f083`

**Tag-verified compiler source commit:** `43627b74af5fccccc5e233e98207413983ebafc1`

This update pins only the published alpha.14 source in the Rust manifest,
Cargo lockfile, independent dependency validator and browser compatibility
metadata. It does **not** switch to a moving branch or publish a new
Playground release.

## What is available to browsers

- Existing typed records, variants, matching, tuple/array/record destructuring,
  persistent lists and canonical maps remain supported by the real Rust
  interpreter compiled into WebAssembly.
- The parser reports clearer missing/duplicate commas and closing delimiters
  in nested destructuring patterns. Errors are returned without partial stdout.
- Two exact upstream fixture pairs are preserved at
  `bridge/tests/fixtures/alpha14/`: `structured_pattern_coverage` exercises
  nominal match arms and immutable bindings; `map_string_projection_snapshots`
  checks that persistent map keys and values remain paired and sorted.
- Native Rust bridge tests verify static mode, check mode and exact run output;
  Vitest checks exact example source bytes; Playwright verifies and executes
  examples in Chromium, Firefox and WebKit with real compiler WASM.

## Deliberate host/browser separation

Alpha.14's `EditorCompilationCache::set_limits` and checked ELF64 integer
object emitter are opt-in **Rust host APIs**, not browser UI features. The
Playground keeps a disposable Web Worker per bounded operation; it does not
persist compilation caches or expose native object files, OS processes,
filesystem projects or network access. The browser inherits the existing
source size, work, output, stdin and resource limits. Logical allocation
budgets are not hard limits on physical browser process memory.

Compiler alpha.14 keeps existing source syntax and JSON diagnostic schemas.
Earlier alpha.13, alpha.12 and other browser regressions remain active.

## Required verification before merge

```bash
npm ci
npm run verify:locks
npm run test:locks
npm run lint
npm run typecheck
npm run test
cargo test --locked --manifest-path bridge/Cargo.toml
wasm-pack build bridge --release --target web --out-dir ../public/compiler --locked
npm run build
npx playwright install --with-deps chromium firefox webkit
npm run test:e2e
```

The CI additionally runs npm and RustSec audits. Pages deployment occurs
only after passing the main-branch gates; this prerelease compiler
integration is **not** a stable compiler or hardened browser sandbox.
