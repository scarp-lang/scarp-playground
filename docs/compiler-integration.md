# Scarp compiler integration audit — 2026-11-03

This document records an independent repository inspection before modifying
Playground's diagnostic editor integration.

## Repositories and snapshots

- Official compiler: https://github.com/scarp-lang/scarp
- Playground: https://github.com/scarp-lang/scarp-playground
- **Latest published compiler pre-release at audit time:** v0.0.5-alpha.4,
  published November 3, 2026; release tag object references
  c957ec8a12e40dae2e82665a73a2da79ed9b34de.
- **Playground's actual compiler:** published v0.0.5-alpha.3, pinned to
  7715c28df09c7703b39e14fddb963275b25df476 in bridge/Cargo.toml.

The new alpha.4 release adds the CLI commands create/launch/project-directory
verify, and a bounded Scarp.project manifest. These are project-management CLI
features; they do not automatically become browser features. Do not change the
WASM dependency to a moving branch or call the browser alpha.4-compatible without
testing exact embedding APIs and updating the version/lockfiles.

## Diagnostic schema reviewed

The **pinned alpha.3** and the current compiler both expose schema-v1 JSON in
src/diagnostics/json.rs, using:

- schema_version = 1, severity, code, message and optional help
- span_encoding = utf-8-bytes (half-open spans local to a given source file)
- column_encoding = unicode-scalar, position_base = 1
- primary: { path, span, start: {line,column}, end: {line,column} } or null
- related: zero or more { message, location }, including locations in other files

The browser consumes this from the **real Rust bridge**, not an approximate
JavaScript parser. Monaco line/columns are UTF-16 based: every supplementary
scalar (e.g. an emoji) occupies two UTF-16 units. Directly using Scarp's
one-based Unicode-scalar columns would highlight the wrong character.

The editor therefore converts only recognized schema-v1 coordinates, validates
file identity against the in-memory source workspace, maps Unicode-scalar
columns to UTF-16, and uses the primary and related file paths. It does not
invent diagnostics or reinterpret schema versions it does not understand.

## Current scope

This editor improvement is targeted at the pinned alpha.3 runtime. A later
upgrade to alpha.4 should separately establish exact tag commit, update
bridge/Cargo.toml and bridge/Cargo.lock, and rerun native Rust, WebAssembly
and Chromium real-execution tests. Preserve the already-published
Playground v0.0.1 alpha tag and its immutable assets.
