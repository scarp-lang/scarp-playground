# Published Scarp v0.0.6-alpha.10 — browser integration

The **unreleased Playground development preview** embeds the published
[v0.0.6-alpha.10 compiler](https://github.com/scarp-lang/scarp/releases/tag/v0.0.6-alpha.10),
at the annotated-tag source commit `44fcd0f77ccb92648cdb1fc7632495c506c87cb3`.
Existing Playground v0.0.1 and v0.0.2 release assets are unchanged.

## Interpreter support in the browser

- Immutable `array<T, N>` values, `[array: ...]` literals, typed empty
  arrays, indexing and nested arrays, checked using the upstream
  `examples/fixed_arrays.srp` fixture and its exact stdout.
- BigInt `bigint_divmod`, `bigint_pow`, `bigint_bit_length`,
  `bigint_to_radix`, `bigint_sqrt` and `bigint_gcd`, tested against
  the upstream `examples/bigint_exact.srp` fixture.
- `try_read_line()` and `read_line_or(fallback)` with an explicitly supplied
  UTF-8 input buffer, including blank lines, Unicode, and EOF behavior.
- Existing compiler diagnostics and navigation remain schema v1.

## Explicit browser boundary

Interactive `input(prompt)`, `ask(prompt)`, `ask_or(prompt, fallback)`,
typed interactive prompts and native `--interactive` are **not enabled**.
The worker uses only `ModuleProgram::execute_with_input` with a bounded
`std::io::Cursor`, and does not call any interactive host API. Selected
interactive calls report E0054 without replaying previously captured output.
Browser input is not saved, shared, or exported.

Native project/test manifests, `.stdout` / `.stderr` test fixtures,
host filesystem access, experimental Decimal Rust APIs, native emitters and
Rust-only compiler caches are likewise not exposed as browser features.

## Resource budgets and verification gates

`ExecutionOptions.max_array_bytes` is explicitly limited to **1 MiB** per
browser execution, in addition to existing **2,048 BigInt digits**, **256 KiB
BigInt limb allocation**, **16 KiB stdin**, **200,000 steps**, **1 MiB captured
output** and a **12-second disposable Worker timeout**. Logical quotas are not
a physical process-memory cap.

The compiler pin is jointly checked in `bridge/Cargo.toml`,
`bridge/Cargo.lock`, `compiler-compatibility.json`, and the independent
dependency provenance script. Before a merge to main, require exact-head
passing locked native Rust tests, WASM compilation, TypeScript lint/typecheck,
unit tests, real Chromium/Firefox/WebKit tests, npm audit and RustSec audit.
No Playground release is authorized or implied by this source update.
