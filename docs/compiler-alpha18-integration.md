# Scarp compiler v0.0.6-alpha.18 integration

**Integration candidate:** the [published alpha.18 compiler](https://github.com/scarp-lang/scarp/releases/tag/v0.0.6-alpha.18)
at approved immutable source `84d8de05968a488773e7c5b6eda1376d8957553c`; the former browser pin was
alpha.16 (`244f713b4fa48f02a98b8e3e3c11025363f35260`). The [official publication
verification](https://github.com/scarp-lang/scarp/blob/main/docs/releases/v0.0.6-alpha.18-validation.md)
records the annotated tag and verified release assets.

## Browser feature surface

- Alpha.17: `array_len(values)` and `array_get_or(values, index, fallback)`
  for immutable fixed arrays, including negative and out-of-bounds fallbacks.
- Alpha.18: `array_set(values, index, replacement)` returns a new fixed-array
  snapshot; original aliases are unchanged. Out-of-range indices report E0063;
  array allocation remains bounded by E0064.
- Alpha.18 Lifetime: zero-length finite/integer numerical windows no longer
  retain the original backing allocation. The browser's published example
  checks **observable program semantics**, not measured heap retention or RSS.
  This is not a complete cycle-collecting garbage collector.

The bridge uses the real Rust interpreter in a disposable Web Worker per request.
Bounded virtual project files, stdout/stderr rollback, JSON diagnostics and
explicit browser-supplied noninteractive stdin remain unchanged. The compiler
manifest, Cargo lock, browser JSON and provenance validator all use the same
immutable source revision, never a moving tag.

## Host-only features

The upstream alpha.18 `scarp exec` default-source discovery, manifest/file
operations and terminal `ask()` prompt retry do not run in the browser.
The alpha.17 `input_boolean(prompt)` function is interactive-only; supplying
text in the browser's `stdin` field does not grant an interactive console.
The Playground must continue returning E0054 for such prompts.

## Acceptance evidence

Byte-exact upstream `.srp` and `.stdout` fixtures are stored in
`bridge/tests/fixtures/alpha17/` and `bridge/tests/fixtures/alpha18/`.
The matching examples are **Fixed-array traversal**, **Immutable array
updates**, and **Lifetime windows**.

Native bridge regressions verify, check and execute exact fixtures and test
atomic E0063 failures, prompt isolation and recovery. Frontend tests protect
displayed source identity and completion hints. Three-browser Playwright tests
verify real Rust/WebAssembly output and Worker boundaries.

**Merge gate:** pinned dependency checks, lint, typecheck, frontend tests,
locked native Cargo tests, the locked wasm-pack build, production bundle,
RustSec/npm audits and the full Chromium/Firefox/WebKit suite must pass.
The existence of a candidate branch does not mean those checks passed.
This integration does not authorize a new Playground prerelease.
