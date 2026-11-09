# Published Scarp v0.0.6-alpha.5 — Playground WASM qualification (2026-11-09)

## Immutable source and scope

- Official compiler repository: https://github.com/scarp-lang/scarp
- Published prerelease: https://github.com/scarp-lang/scarp/releases/tag/v0.0.6-alpha.5
- Annotated tag object: `663c54ec3e6931141f49a41092dd4946bb99ce64`
- Tag **peels to source commit**: `205e92f166f186c3905e5880d41c31717b697b8e`.
- Playground bridge `Cargo.toml`, `Cargo.lock`, browser compatibility display,
  and the dependency-provenance verifier must all agree on that exact **commit SHA**.
  Cargo must not float to a moving `main` branch or resolve an unreviewed tag.

The compiler change from the previously pinned alpha.4 source is 26 commits.
Changed compiler implementation files include numerical kernels and the narrow
native-object emitter. The browser's existing `MemorySourceLoader`, module
diagnostic encoding and public embedding boundaries did not change in the
comparison; this does **not** substitute for compiling and testing the pinned
real WebAssembly bridge.

## New interpreter operations

The browser interpreter can use:

- `top_p(probabilities, mass)` — deterministic zero-based index ranking
  covering the minimal mass prefix, with stable ties and an inclusive mass
  of 1.0 retaining zero-valued tails.
- `top_p_values(probabilities, mass)` — corresponding values in stable order.
- `pearson_correlation(left, right)` — bounded centered correlation for
  paired nonconstant finite vectors, distinct from cosine similarity.

Playground's two new built-in programs use **exact source** from the alpha.5
tag's `examples/nucleus_selection.srp` and
`examples/pearson_correlation.srp` files. Expected tagged stdout:

```text
Top-P:
[integer: 0, 1]
[0.5, 0.25]
[integer: 0, 1, 2]
[integer: 1, 2]

Pearson:
1.0
-1.0
0.0
```

Regression tests must also reject invalid mass and constant-axis correlation
with E0034, no leaked partial stdout, and successful subsequent Worker runs.

The alpha.5 Rust-host ELF64 object emitter is **not** a browser-native compiler
or executable linker. This preview does not add stochastic sampling, a model
runtime, operating-system file access, external packages or a GPU backend.

## Mandatory acceptance checks

1. Verify the annotated release tag's exact source commit, Cargo manifest,
   lockfile and independently enforced JS provenance constants.
2. Pass `npm ci`, `npm run verify:locks`, `npm run test:locks`,
   `npm run lint`, `npm run typecheck`, and `npm run test`.
3. Pass `cargo test --locked --manifest-path bridge/Cargo.toml` and
   `wasm-pack build bridge --release --target web --out-dir ../public/compiler --locked`.
4. Pass the built-site and real Chromium/Firefox/WebKit Playwright checks,
   including source imports, Unicode diagnostics, cancellation, output limits,
   resource-pressure recovery and production CSP.
5. Confirm the successful `main` deployment before calling the *live site*
   alpha.5-compatible; a draft PR or its passing CI is not a deployment.

**Status:** This is an alpha.5 upgrade candidate, not a claim that the
candidate has passed all gates or reached GitHub Pages. The published
Playground v0.0.1 and v0.0.2 archives remain unchanged. No new Playground
prerelease or stable release is authorized by this integration work.
