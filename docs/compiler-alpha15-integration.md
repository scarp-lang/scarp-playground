# Scarp v0.0.6-alpha.15 browser integration

**Published upstream prerelease:** https://github.com/scarp-lang/scarp/releases/tag/v0.0.6-alpha.15

**Annotated Git tag object:** `4c3a457d6a9a084b39887c059e8f37b5d7b35305`

**Tag target, immutable compiler source:** `a21b7b6d942bd1ca9abbbbb522f92f9c8e21e281`

The published annotated tag is unsigned; confirming its target and matching
release metadata is provenance checking, **not cryptographic signature
verification**. Cargo.toml, Cargo.lock, the independent lockfile validator and
browser compatibility metadata must all identify this exact commit.

## Interpreter behavior

- Scarp syntax and compiler-produced diagnostic JSON remain compatible with
  alpha.14. Previously shipped alpha.14 and older regression fixtures are kept.
- For equality/inequality on **equal UTF-8 byte length** strings, the interpreter
  charges one step per *started 64 bytes* before returning a comparison result.
  Mismatched byte lengths can return unequal without scanning the strings.
- The browser uses a fixed 200,000 interpreter-step budget. This change can
  make long comparisons hit that limit sooner. Runtime and Check mode are
  evaluated under the same fixed quota; static Verify does not run statements.
  Errors discard partial stdout/stderr in the compiler bridge.
- A native Rust regression exercises the exact 12/13-step boundary for
  129-byte strings, verifies the operator's UTF-8 span, and confirms atomic
  output. Playwright exercises Verify/Check/Run using the real WASM compiler
  for equal-length Unicode strings in Chromium, Firefox and WebKit.

## Host-only changes

- Upstream CLI `inspect tokens` / `inspect ast` source limits are not
  Playground features. The browser continues to enforce its own **64 KiB per
  source** and **128 KiB total source** limits.
- The `CachedCompileError::RevisionMismatch` variant applies to host callers
  using opt-in compilation caches. The Playground intentionally creates a new
  disposable Worker per operation; no cache is persisted across runs.
- Experimental checked ELF64 left/right shift kernels emit x86-64 relocatable
  objects for selected integer programs. There is **no browser native object
  compiler, ELF loader, shell, filesystem bridge or backend execution**.

## Verification required before merge

```bash
npm ci --no-audit --no-fund
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
npm audit --audit-level=high
cargo audit --file bridge/Cargo.lock
```

**Security gate:** the high-severity `picomatch` advisory found on the alpha.14
PR remains a blocking external dependency issue until the updated exact npm
lockfile independently passes the full audit. Do not disable the audit, force a
Vitest downgrade, merge a red PR or publish a new Playground release.
