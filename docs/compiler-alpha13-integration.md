# Scarp v0.0.6-alpha.13 browser compatibility

**Compiler release:** https://github.com/scarp-lang/scarp/releases/tag/v0.0.6-alpha.13

**Immutable source commit:** `e755fda37cdaeed29434e848cb5dd41f2f2e7eb2`

**Annotated release tag object:** `8578d9d92899d335ccd3f118f3c56f417a465de7`

This integration targets the actual published **prerelease**, not the moving
compiler `main` branch. The immutable revision was confirmed by dereferencing
the annotated Git tag. The Rust manifest, Cargo lock, independent provenance
validator, and browser compatibility JSON must all agree. This does **not**
publish a new Playground release; its latest tagged prerelease is still v0.0.2.

## What changed in alpha.13

- The Rust interpreter reuses immutable Option/Result error payloads on checked
  early returns. Forwarding `None` does not allocate a payload. Existing
  Scarp source syntax and the alpha.12 typed-propagation examples are retained.
- Syntax and semantic cache retention budgets and revision-aware eviction are
  supported by opt-in Rust host APIs.
- Opt-in Rust editor analysis attaches results to a host workspace generation;
  callers must reject stale analyses after edits or import rebinding.

The Playground's WebAssembly bridge **does not expose a resident compiler
cache or long-lived editor program**. It recompiles the entire validated
in-memory workspace inside one disposable Worker for each request. The
existing single-Worker slot, request cancellation, 12-second wall-clock
limit and per-request compilation isolate stale results and bound accumulated
compiler memory. They do not enforce a physical browser-process memory cap.
Do not describe compiler cache APIs as an enabled browser feature.

## Official release fixture coverage

| Playground example | Compiler source | Expected output |
| --- | --- | --- |
| Ordered map snapshots | `examples/map_projection_snapshots.srp` | `examples/map_projection_snapshots.stdout` |
| Boolean map snapshots | `examples/aggregate_resource_boundaries.srp` | `examples/aggregate_resource_boundaries.stdout` |
| Persistent task list snapshots | `examples/persistent_list_updates.srp` | `examples/persistent_list_updates.stdout` |
| Immutable compiler fixture | `examples/semantic_cache_snapshot.srp` | `examples/semantic_cache_snapshot.stdout` |

Files under `bridge/tests/fixtures/alpha13/` preserve the exact published
source and output text from commit `e755fda37cdaeed29434e848cb5dd41f2f2e7eb2`. Vitest asserts
that browser example source bytes equal these fixtures. Native Rust tests
compile, check, and execute the same fixtures through the real compiler bridge.
Playwright runs Verify and Run in **Chromium, Firefox, and WebKit** using the
built WASM module, and confirms exact output, atomic diagnostic failures and
recovery in a new Worker. Earlier alpha.12/11/10 regressions remain enabled.

## Verification and deployment gates

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

The GitHub Actions workflow also audits npm and RustSec advisories, and only
deploys the main-branch Pages preview after the test jobs pass. Browser
execution still has the existing source, stdout, input, collection, BigInt,
logical-step and captured-output quotas; the Rust native file/terminal/CLI,
module filesystem projects, native code generation and persistent host caches
are **not** available in the Pages preview. Security issue #3 remains open;
alpha.13 compatibility is not a stable-release or hardened-sandbox claim.
