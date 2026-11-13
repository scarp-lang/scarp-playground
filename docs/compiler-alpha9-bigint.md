# Scarp v0.0.6-alpha.9 browser integration

The experimental development preview pins the *published* compiler source
`0814997dc43982eb707a9a1aee72aab3a7ac8b41` from [v0.0.6-alpha.9](https://github.com/scarp-lang/scarp/releases/tag/v0.0.6-alpha.9).
This is not a new Playground release and does not alter historical release assets.

## In-browser interpreter functionality

- The actual Rust interpreter supports `bigint("123...")`, `bigint_from_integer`,
  `bigint_to_integer` and `bigint_abs`, exact signed arithmetic and comparisons.
- It supports `bigint` in typed functions and imported .srp modules.
- The two built-in BigInt examples use the published compiler's
  `examples/bigint_arithmetic.srp`, `examples/bigint_module.srp` and
  `examples/modules/bigint_math.srp` fixtures, with the historical
  prepublication comment removed from the first example.
- A BigInt is not a `float` or an i64 `integer`; conversions are explicit.
  Malformed decimal input yields E0051; conversion beyond i64 yields E0044.
- The browser uses `ExecutionOptions.max_bigint_digits = 2_048` and
  `max_bigint_bytes = 256 * 1024`, plus its existing 200,000-step,
  1 MiB captured-output, per-Worker timeout and one-active-Worker limits.
  These are interpreter-level quotas, **not** a browser physical memory cap.

## What remains native-only

The alpha.9 `scarp test --json=v2` reports operate on native project
manifests and local test fixtures. The Playground does **not** execute
filesystem-dependent `scarp test`, `scarp init`, `scarp project info`,
or native build commands. The existing browser Check code operation
continues to evaluate selected interpreter paths and can fail at runtime;
it is not the non-executing CLI `verify` command.

## Security and acceptance

The bridge uses only in-memory source files, explicit bounded stdin and
compiler-owned diagnostics. No JS implementation of BigInt evaluation is used.
Pin updates must change `bridge/Cargo.toml`, `bridge/Cargo.lock`,
`compiler-compatibility.json`, and the independently checked
`scripts/check-dependency-locks.mjs` constants together.

Before merging, require the exact-head GitHub CI checks for locked Rust
native tests, wasm-pack, frontend lint/type tests and real browser tests
including `tests/e2e/compiler-alpha9.spec.ts`, dependency advisory
audits and the cross-browser suite. Passing these checks is **not**
certification against process OOM or WASM panic; issue #3 remains open.
Do not publish a stable Playground release on the strength of this upgrade.
