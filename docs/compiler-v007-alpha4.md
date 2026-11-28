# Scarp v0.0.7-alpha.4 browser integration

Published 28 November 2026. [Upstream release](https://github.com/scarp-lang/scarp/releases/tag/v0.0.7-alpha.4), annotated source commit `e620bdcb512fbe909b08f1b4cc625865e4cdf339`.

The bridge uses the published Rust interpreter, not the experimental x86-64 ELF64 emitter. Three upstream example source/stdout pairs are copied verbatim into `bridge/tests/fixtures/v007_alpha4`. The two-module contextual inference case is adapted from upstream `tests/generic_functions.rs`.

| Fixture | Interpreter behavior |
| --- | --- |
| native_recursive_entry | Mutual recursion and integer GCD |
| native_nested_aggregate_locals | Nested records, tuples, arrays and immutable snapshots |
| bigint_wide_exponents | Exact BigInt exponents and modular arithmetic |
| context | Contextual inference across imported generic functions |

The Rust bridge verifies, checks and executes each fixture; browser tests exercise the three single-file fixtures with actual WASM. Missing generic context remains an error. The fixed 2,048 decimal digit, 256 KiB limb reservation, 200,000 logical work, and 64-frame call limits remain unchanged. The browser does not expose file-backed BigInt CLI arithmetic, filesystem access, native object emission or a linker. This integration is experimental until its exact-head CI passes; successful tests are not proof of a hardened sandbox.

## Editor and example browser

Five learning workspaces expose the three upstream fixtures, two-module context inference and a small number theory exercise adapted from upstream tests. Fifteen static completion hints use published BigInt signatures, with matching Monaco highlighting. No browser quota or host filesystem access changes. Browser tests open the actual example picker and verify the selected source executes with the real WASM interpreter.
