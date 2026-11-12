# RustSec advisory gate for the Playground Rust bridge

**Security gate:** the workflow checks `bridge/Cargo.lock` with
[cargo-audit](https://github.com/rustsec/rustsec/tree/main/cargo-audit)
against the live RustSec Advisory Database. This scans the dependency
versions recorded for the published, immutable Scarp compiler and the
Rust-to-WebAssembly Playground bridge, **not** a guessed set of direct
dependencies.

## How CI enforces this

The `Playground CI and Pages` workflow has a separate
`rustsec-audit` job that runs alongside full Rust/WASM and three-browser
checks. This job:

1. Checks out the exact PR or main-branch commit.
2. Verifies npm/Cargo dependency sources and the Scarp alpha.8 source
   SHA through the existing local lockfile provenance checker.
3. Installs a version-selected `cargo-audit 0.22.2` from its Cargo.lock.
4. Runs `cargo audit --file bridge/Cargo.lock`, fetching fresh RustSec
   database entries rather than accepting a stale, committed snapshot.

The **GitHub Pages deployment requires both jobs to succeed**. An identified
RustSec vulnerability is not silently ignored and a failed audit must not
be changed to `continue-on-error`.

You can run the same audit locally in the project root:

```sh
node scripts/check-dependency-locks.mjs
cargo install cargo-audit --locked --version 0.22.2
cargo audit --file bridge/Cargo.lock
```

`--file` tells cargo-audit exactly which committed lockfile to scan. It
does not use the outer repository root's nonexistent Cargo.lock or
regenerate an unlocked graph. The separate build job still compiles the
real pinned Scarp commit and runs native and browser regression tests.

## What an audit result means

- A passing job means the locked Rust dependency graph has no vulnerabilities
  detected by the **RustSec database fetched by that run**, subject to
  advisory availability and scanner limitations.
- Unmaintained, unsoundness, or yanked-crate notices may be **warnings**,
  not proof of an immediately exploitable vulnerability. Review and track
  them explicitly rather than misrepresenting a successful exit code.
- The scanner does not inspect the Playground's own code, app JavaScript,
  dynamic packages installed by `cargo install wasm-pack`, GitHub Actions
  or the full source of a Git-pinned compiler for unpublished problems.
- No checksum, clean RustSec audit or sandbox-style Worker termination can
  guarantee browser process/heap safety, malicious-code isolation or
  immunity to unknown vulnerabilities.

## When an advisory blocks the build

Preserve its RustSec ID, crate/version, affected APIs, upstream fix and
the exact audit CI link. Determine whether the affected crate is used
in browser-delivered Rust code, native build tools or both. Prefer a
reviewed compatible dependency upgrade and regenerate `bridge/Cargo.lock`
using Cargo, then rerun all native, WASM and browser tests.

Never change the immutable compiler pin without separately reviewing the
compiler release/tag provenance and integration. Avoid broad ignores; any
exception requires explicit, scoped, version-specific review in the PR
and a tracked follow-up.

This gate advances [Playground security issue
#3](https://github.com/scarp-lang/scarp-playground/issues/3) but does not
close the independent browser OOM, Worker response-header, origin isolation,
npm moderate advisory and security review requirements. It does not
authorize Playground 1.0 stable.
