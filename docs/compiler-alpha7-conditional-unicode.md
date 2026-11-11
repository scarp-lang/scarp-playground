# Compiler v0.0.6-alpha.7 — conditional values and Unicode escapes

The Playground's development branch integrates the **published** Scarp
`v0.0.6-alpha.7` compiler at immutable commit
[`b1c1fd232b418267d95520c69ee563ac99ecae30`](https://github.com/scarp-lang/scarp/commit/b1c1fd232b418267d95520c69ee563ac99ecae30).
This is a prerelease compiler and does not change Playground release tags.

## Compatibility reviewed

- `if condition { value } elif condition { value } else { value }` is an
  expression that evaluates only the selected result. The final `else` is
  mandatory, and all branches must have the same resolved type.
- String literals accept `\\u{HEX}` for Unicode scalar values. Malformed
  escapes, surrogate scalars, and values above U+10FFFF are rejected.
- Source module constants and experimental native C11/ELF64 backends do not
  support these conditional expressions. Playground runs the interpreter only.
- The bridge uses `compile_with_loader`, `compile_indexed_with_loader`,
  `execute_with_input` and the bounded `ExecutionOptions` interface; the
  compiler's new expression variant does not require exhaustive matching
  in the browser bridge.
- The compiler dependency's Rust manifest adds no crates. The existing Cargo
  transitive dependency graph stays pinned; `bridge/Cargo.lock` records the
  new exact compiler revision and version. No moving Git refs are used.

## Executable regression

`Conditional values + Unicode escapes` reproduces the published compiler's
`examples/conditional_unicode.srp` verbatim. Its authoritative stdout is
`नमस्ते 👋 7` followed by a newline. In particular, its unselected
`text_repeat("unreached", -1)` and `1 / 0` expressions must not execute.

The alpha.7 Playwright suite verifies the actual WASM interpreter output,
a skipped stdin read in an unselected branch, a conditional type error, and
a rejected surrogate escape. The JS example test verifies that Scarp
backslash-u sequences were not prematurely decoded by the TypeScript bundle.

## Required validation before merge

Run the repository's CI workflow with its locked dependency provenance checks,
native bridge Rust tests, `wasm-pack` build, TypeScript lint/typecheck/unit
tests, all three browser engines, RustSec audit and npm audit. Do not assume the
change is verified merely because the upstream compiler release passed its
own test matrix. Keep browser resource/input limits and isolation unchanged.

Official upstream evidence:
[release](https://github.com/scarp-lang/scarp/releases/tag/v0.0.6-alpha.7),
[fixture](https://github.com/scarp-lang/scarp/blob/b1c1fd232b418267d95520c69ee563ac99ecae30/examples/conditional_unicode.srp),
[compiler release verification](https://github.com/scarp-lang/scarp/blob/main/docs/releases/v0.0.6-alpha.7-publication.md).
