# Published Scarp v0.0.6-alpha.4 — Playground integration contract (2026-11-08)

- Tagged release: https://github.com/scarp-lang/scarp/releases/tag/v0.0.6-alpha.4
- Annotated tag peels to source commit `f04be0758cbce405ddcdb229699b0ff83c09d207`.
- The bridge manifest, Cargo lock, dependency provenance checker and UI must agree on the immutable compiler revision. Historical Playground v0.0.1 and v0.0.2 archives are unchanged.
- New interpreter features: sampled area, cumulative area, slopes and cosine similarity. Alpha.4 also publishes a **Rust host-only** ELF64 integer object emitter, **not** a browser-native compiler or CLI feature.
- The disposable browser worker, source and runtime limits, in-memory source resolution, structured diagnostics and compiler-backed navigation remain unchanged.

## Merge/deploy gates

Require successful locked npm/Cargo provenance, RustSec, native Rust bridge tests, JavaScript lint/typecheck/unit/build, wasm-pack compilation and real Chromium/Firefox/WebKit Playwright runs. New tests execute official alpha.4 example sources against the actual pinned interpreter and check exact published stdout, domain errors, atomic output and worker recovery.

**Status:** Integration proposed; CI and Pages deployment must be checked before describing the live site as alpha.4-compatible. No new Playground release is authorized by this update.
