# Scarp v0.0.6-alpha.11 — exact decimal browser integration

The unreleased Playground development preview pins the published
[Scarp alpha.11 compiler](https://github.com/scarp-lang/scarp/releases/tag/v0.0.6-alpha.11)
at exact source commit `79b57395957f47e1270ee542a856c844b82386de`.
The existing Playground v0.0.1/v0.0.2 releases stay unchanged.

## Real interpreter coverage

- Decimal is exact base-10, with at most 28 coefficient digits and 18 fractional places.
- The published `examples/decimal_exact.srp` prints `235.99`, `0.3`, `0.33` on separate lines.
- `decimal` values are supported in typed imported functions and fixed-size arrays.
- `decimal_round`, `decimal_format` and `decimal_div_rounded` use explicit rounding.
- `decimal(read_line())` uses bounded, ephemeral browser stdin.
- Errors E0068 (invalid text/mode), E0069 (limits), E0070 (inexact) are compiler-owned.

Exact division of `decimal("1") / decimal("3")` fails with E0070 unless
explicit rounded division is requested. No binary float conversion occurs.

## Browser safety boundaries

The WASM bridge calls `ModuleProgram::execute_with_input` with an in-memory
Cursor. `input_decimal(prompt)` and other host interactive prompts return
E0054, even when stdin was provided. No browser code invokes host filesystem,
terminal, source networking or a remote execution service.
Input is not saved, shared or exported. Output is discarded on failed runs.

The existing limits remain: 12 files, 128 KiB source, 16 KiB stdin,
200,000 steps, 1 MiB capture, 1 MiB array allocations, 2,048 BigInt digits,
256 KiB BigInt memory charges, and a 12-second disposable Worker timeout.
These logical resource ceilings are **not a hardened sandbox**.

## Merge requirements

Require exact-head locked native Rust tests, real wasm-pack, JS unit and
Chromium/Firefox/WebKit tests, typecheck, lint, npm audit and RustSec audit.
Verify main Pages deployment separately after merge. No Playground version
publication is included in this compiler integration.
