# Scarp v0.0.6-alpha.8 browser compatibility

The Playground development branch pins the **published experimental**
Scarp compiler v0.0.6-alpha.8 source at
`37253e7805c0ca594560700dd1deb3928458e60d`.
The annotated upstream tag `v0.0.6-alpha.8` resolves to this immutable
commit. The Playground's historical tagged releases are unchanged.

## Available through browser WebAssembly

- `assert(condition);` checks a Boolean expression only when it executes.
- `assert(condition, "literal message");` supplies an optional static,
  quoted message of at most 256 UTF-8 bytes.
- A failed assertion returns the official compiler's source-located **E0065**
  diagnostic, including locations in imported `.srp` modules.
- Assertions use the same bounded interpreter work, call and output budgets as
  ordinary code. An assertion failure does not replay buffered stdout.
- The compiler owns assertion validation. Monaco syntax coloring and completion
  suggestions only assist editing; they do not emulate runtime behavior.

Try **Boolean assertions** in the built-in examples list. Its source is taken
from the published compiler fixture `examples/assertions.srp`, with the
obsolete prepublication comment updated.

## Important difference: Check code vs static verify

The Playground's **Check code** button still calls the existing
`CompiledProgram::check` path, which evaluates selected code without
returning program output. It is **not** the non-executing native CLI
`scarp verify FILE.srp` command. Consequently, reached `assert(false)`
statements fail with E0065 in both browser Run and browser Check.

## Native project commands are intentionally excluded

The alpha.8 `scarp init`, `scarp test`, `scarp project info`, and
filesystem-based `scarp.project` workflows are **not** implemented in the
browser. The Playground still has an isolated in-memory `.srp` source graph,
with no filesystem-backed project manifest, host CLI or server execution.

## Verification gates

On the pull request, GitHub Actions must pass:

1. Lock provenance, npm audits, JavaScript lint/type tests, and Rust native
   tests against the exact compiler pin.
2. A locked WebAssembly build and browser end-to-end tests, including
   `tests/e2e/compiler-alpha8.spec.ts`.
3. The RustSec advisory audit and three-browser compatibility suite.

Do not merge this upgrade solely because the editor examples render.
A green real-compiler/WebAssembly gate is needed.
