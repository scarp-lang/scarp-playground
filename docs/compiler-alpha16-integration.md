# Scarp compiler v0.0.6-alpha.16 integration

**Status:** pinned to the [published alpha.16 prerelease](https://github.com/scarp-lang/scarp/releases/tag/v0.0.6-alpha.16),
at its annotated tag's immutable commit `244f713b4fa48f02a98b8e3e3c11025363f35260`. The former Playground
compiler pin was `a21b7b6d942bd1ca9abbbbb522f92f9c8e21e281` (alpha.15). This is still an experimental preview.

## Features shipped in the browser

- `median(vector)` and `quantile(vector, fraction)` provide exact published
  type-7 interpolation semantics over finite vectors and visible windows.
  The bounded interpreter sorts a charged immutable copy, not source values.
  The fraction must lie within 0.0 and 1.0.
- Unicode scalar text mapping/reversal, codepoint construction, reverse exact
  search and nonoverlapping match counts run with the compiler's Rust semantics.
- Signed 64-bit bit counts, reversal, rotations, absolute value, sign, GCD and
  LCM use checked arithmetic and compiler-owned diagnostics.
- Static editor hints and highlighting cover the released names without
  attempting semantic completion or language execution in JavaScript.

The Playground retains its disposable Web Workers, in-memory modules, explicit
ephemeral stdin, fixed print/work/allocation quotas and atomic stdout/stderr.
It never sends source to a remote execution service. Bounded vector sorting
charges CPU steps and an immutable numerical copy; it is not a free operation.

## Evidence and regressions

Exact upstream source from the annotated compiler release was copied to
`bridge/tests/fixtures/alpha16/` and displayed in the example browser:

| Compiler source | Browser example | Scenarios |
| --- | --- | --- |
| `examples/order_statistics.srp` | Median and quantiles | Quartiles, median of window, immutable vector |
| `examples/core_collections.srp` and `examples/modules/collection_tools.srp` | Unicode and integer utilities | Typed imported function, non-ASCII expansion, integer and bit operations |

`tests/compiler-alpha16-fixtures.test.ts` checks example-source identity,
including the imported module. `bridge/src/alpha16.rs` runs static Verify,
silent Check and exact-output Run through the real Rust bridge; negative cases
assert failure diagnostics and no partial buffered output. Three-browser
Playwright WebAssembly tests repeat the exact fixtures and Worker recovery.

The Rust-host-only `ConstantCache::set_limits` API and Linux ELF64 stack
page probing are **not** browser runtime features. The Playground does not
generate executable machine code or expose native CLI filesystem commands.

Validation: `npm run verify:locks`, `npm run test:locks`, `npm run lint`,
`npm run typecheck`, `npm run test`, `cargo test --locked --manifest-path
bridge/Cargo.toml`, `wasm-pack build bridge --release --target web
--out-dir ../public/compiler --locked`, `npm run build` and `npm run
test:e2e` in the existing GitHub Actions workflow.
