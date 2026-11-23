# Scarp compiler v0.0.6-alpha.19 browser integration

**Published source:** [Scarp alpha.19](https://github.com/scarp-lang/scarp/releases/tag/v0.0.6-alpha.19), immutable commit `e534e73a81c9500e3aef9f3d51cafa0bc7bbcf75`.
Previous browser pin: alpha.18 (`84d8de05968a488773e7c5b6eda1376d8957553c`).
The compiler release is a prerelease; the Playground remains a development preview.

## Compatibility decision

Alpha.19 adds **Rust embedding** support for named callable handles, signature/effect checks,
export-aware module selection, deterministic execution receipts, bounded argument payloads,
and cumulative host quotas. These APIs are not equivalent to function values in the
Scarp language. The language still has ordinary named `funcra` and `pure funcra` calls,
**not** user-constructible callbacks, closures, aliasing a named function into a binding,
or indirect invocation of arbitrary values.

The browser bridge continues to use the official interpreter's module execution,
static verification, indexed source navigation and bounded in-memory input APIs.
It does not expose the new Rust host callable or ledger APIs to JavaScript.
The legacy browser safeguards stay in force: local-only virtual files, disposable
workers, execution timeout, source/byte caps, atomic errors and opt-in buffered
prompts. No new Scarp syntax or native compilation capability is claimed.

## Exact-source regression coverage

- `bridge/tests/fixtures/alpha19/callable_effect_boundaries.srp` and
  `.stdout` are exact copies of the released upstream fixtures.
- `bridge/src/alpha19.rs` checks Verify/Check silence, Run output, and failure
  of source-level function aliasing with no partial output.
- Vitest checks example source identity and expected fixture output.
- Playwright runs success and rejection cases through actual WASM in
  Chromium, Firefox and WebKit, alongside previous alpha fixtures.

## Provenance and merge gate

`bridge/Cargo.toml`, `bridge/Cargo.lock`, `compiler-compatibility.json`,
and `scripts/check-dependency-locks.mjs` must agree on the **exact** alpha.19
commit and version. The compiler's upstream `Cargo.toml` changes only its
version between these two pins; the git dependency is still frozen at a full SHA.
The existing checked-in registry checksum inventory is unchanged.

Before merging: pass `npm run verify:locks`, `npm run test:locks`, lint,
typecheck, Vitest, `cargo test --locked --manifest-path bridge/Cargo.toml`,
locked `wasm-pack` build, production build, npm/RustSec audits, and all three
real-browser Playwright engines. Source review or a green frontend test alone
cannot establish WASM compatibility. This change does not authorize publication
of a new Playground release.
