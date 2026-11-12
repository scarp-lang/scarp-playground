# Locked dependency provenance and advisory review

**Status:** development-preview security gate, reviewed 12 November 2026.

Scarp Playground builds static assets on GitHub Actions with both
`package-lock.json` and `bridge/Cargo.lock` committed to the repository.
Production is a browser-only React/Monaco client and Rust/Scarp WebAssembly
worker. Compiling against a known source revision is necessary for
reproducibility, but a known checksum alone is not proof of safe code.

## Run the checks

```bash
npm ci --no-audit --no-fund
npm run verify:locks
npm run test:locks
npm audit --audit-level=high
cargo test --locked --manifest-path bridge/Cargo.toml
cargo install cargo-audit --locked --version 0.22.2
cargo audit --file bridge/Cargo.lock
```

The regular **Playground CI and Pages** workflow gates deployment on both
the full Rust/WebAssembly/browser checks and a separate RustSec advisory scan
of the exact bridge Cargo.lock. The RustSec job uses a fresh advisory database
and runs in parallel with the browser build. The npm audit checks
both production and development dependencies used to produce the served
bundle. A high- or critical-severity advisory **fails the workflow**;
do not introduce broad silent ignores merely to keep publishing green.

## Exact guarantees and review boundaries

The deterministic local checker rejects:

- An npm lockfile that changes the project's name, version or root direct
  dependencies without updating its manifest.
- New or modified npm tarballs outside the canonical
  `https://registry.npmjs.org/` host, incomplete HTTPS tarball URLs,
  missing SHA-512 Subresource Integrity data or symlink entries.
- A Cargo registry crate whose origin differs from crates.io's official
  index or whose entry omits a 64-digit SHA-256 checksum.
- The Scarp compiler moving away from the published
  **v0.0.6-alpha.8** release-source revision
  `37253e7805c0ca594560700dd1deb3928458e60d`.
  The Cargo manifest and lockfile must match this reviewed revision.
- Browser-displayed compatibility metadata whose compiler version, immutable
  revision or release URL diverges from the same independent reviewed pin.
  `compiler-compatibility.json` is loaded by the UI and the boot test but
  checked against independent constants before deployment.
- Any unexpected extra local Cargo crate or alternate Git dependency.

The npm graph currently contains **bundled subdependencies** inside the
Tailwind CSS WASI package. Those `inBundle: true` entries do not have
individual package tarball `resolved` or `integrity` fields. The checker
explicitly treats them as bundled contents rather than misreporting them as
unverified remote downloads; the enclosing tarball must still be checksummed.
Changes to bundled code must be assessed through the enclosing package.

The checker has executable tampering-detection regression tests.
The advisory check uses npm's **live vulnerability database**, so results
can change without any committed dependency change. It should be run on
all PRs and main-branch deployments; investigation of failed advisories must
use the exact package paths and affected versions from the CI log.

## Not proven by this milestone

- Checksums verify artifact identity; they do **not** guarantee that a
  dependency or its installation scripts are trustworthy.
- The [RustSec audit gate](rustsec-advisory-gate.md) checks known advisory
  matches for the pinned Cargo dependency graph; it does not scan source
  for undisclosed vulnerabilities, nor does it fully cover dynamically
  installed native tooling. The `wasm-pack` installer, GitHub Actions,
  the source of the Git-pinned compiler and the build-service infrastructure
  remain separate supply-chain inputs.
- The checker cannot detect malicious code inserted into the npm registry
  before a checksum was originally recorded, upstream compiler semantic
  vulnerabilities, compromised build agents or browser process-memory OOM.
- This is not a Software Bill of Materials, independent penetration test,
  or authorization to release Playground v1.0.0 stable.

## Remediation and review

When an audit fails, preserve the advisory identifier, affected package,
severity and transitive dependency chain in the PR. Compare release notes
and the current lockfile; upgrade only to reviewed compatible releases.
Regenerate the appropriate lockfile with its package manager, rerun tests
and review any new package sources or scripts. Do not overwrite an advisory
failure by disabling the checker or committing a pre-generated artifact with
a different origin. Compiler pin updates require an independent integration
review and documented regression evidence, not just a dependency refresh.

For security-sensitive findings, use the private vulnerability reporting and
triage process in [SECURITY.md](../SECURITY.md). Security issue
[#3](https://github.com/scarp-lang/scarp-playground/issues/3) stays open
until worker/origin security, memory testing, remaining advisories and independent
review are complete.
