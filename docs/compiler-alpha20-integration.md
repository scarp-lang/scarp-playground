# Scarp compiler v0.0.6-alpha.20 browser integration

**Published prerelease:** [Scarp v0.0.6-alpha.20](https://github.com/scarp-lang/scarp/releases/tag/v0.0.6-alpha.20).
**Annotated tag target / exact Rust pin:** `b1a9347f93540fdf95b0ddecba4adc55a3b4bb98`.
Previous browser pin: alpha.19 (`e534e73a81c9500e3aef9f3d51cafa0bc7bbcf75`).

## Supported source behavior

- Exact base-ten `d` literals (for example `0.1d + 0.2d`) execute in the
  official Rust interpreter in a disposable Web Worker. Unsuffixed floats
  retain IEEE-754 behavior; mixed float/decimal expressions are errors.
- Constant-index assignment of mutable tuple elements creates persistent
  snapshots and leaves previously bound tuple values unchanged.
- Compatible numeric tuples support lexicographic ordering, including nested
  tuples and the documented signed-zero ordering semantics.
- Monaco now styles lowercase-`d` decimal literals as one numeric token, and
  exposes a syntax-only starter snippet. The compiler remains authoritative
  for valid literals and diagnostic spans.

## Explicitly not available in this browser

- The alpha.20 *Rust embedding* ELF64 object writer is Linux x86-64 only. This
  is not a JavaScript/WASM function or Scarp source operation. The Playground
  cannot compile native objects, link binaries, or run system executables.
- Rust host-callable handles, process resource quotas, and native ABI signatures
  are not Scarp source-language values or browser APIs.
- The new canonical `scarp.project` filename belongs to CLI project
  scaffolding. This Playground intentionally stores virtual `.srp` sources
  only and does not read/write local manifests or filesystems.

## Regression and provenance gate

- `bridge/tests/fixtures/alpha20/tuple_index_updates.*` and
  `tuple_ordering.*` are byte-for-byte copies of the tagged official
  `examples/` fixtures, including their golden stdout.
- `decimal_literals.*` is a browser-specific regression based on the
  published compiler's `tests/decimal_literals.rs` output contract.
- Rust unit tests exercise Verify, Check, Run and atomic rejection of implicit
  Decimal/float coercion; Vitest checks the example/fixture identity and the
  number highlighter; Playwright executes all three through real WASM in
  Chromium, Firefox and WebKit.
- `bridge/Cargo.toml`, `bridge/Cargo.lock`,
  `compiler-compatibility.json`, and the independent provenance validator
  must all match the exact annotated-release commit above. Never use
  moving `main` or an unverified `git` branch for browser execution.

**Merge qualification:** `npm run verify:locks`, `npm run test:locks`,
ESLint, TypeScript, Vitest, locked Rust bridge tests, locked `wasm-pack` build,
production bundle, npm/RustSec advisory audits, and three real browser engines.
Passing static checks alone does not demonstrate executable WASM compatibility.
No Playground release is authorized by this integration change.
