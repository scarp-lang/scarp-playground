# Deterministic compiler input-mutation regressions

**Status:** Development preview hardening for [security issue #3](https://github.com/scarp-lang/scarp-playground/issues/3).

`bridge/src/fuzz_regression.rs` tests the **actual pinned Scarp
v0.0.6-alpha.1 interpreter**, the bridge's raw JSON validation, its
check-only mode, and the compiler-owned Go to Definition index.
The harness intentionally has **no** external fuzzer dependency, random OS
source, third-party runner or networked corpus.

Run the suite (including existing bridge tests):

```bash
cargo test --locked --manifest-path bridge/Cargo.toml
```

To reproduce an individual failure, see the test failure's operation,
constant seed (`0x5ca2202611060003`), case index and serialized request.
The Rust test's captured input identifies the exact program or malformed
wire request. The generator is deterministic across all CI runs.

## Cases and invariants

- 256 bounded mutations of executable Scarp examples, covering Unicode,
  declarations, loops, functions, builtins, imports, and malformed tokens.
  Every input is sent independently to **Execute**, **Check** and static
  **Definition** (768 bridge calls).
- 128 seeded mutations of raw JSON request data, sent to all three
  operations (384 more bridge calls).
- Seven representative malformed payloads, rejection and immediate valid
  execution recovery (28 further bridge calls).
- Mutations occur at Unicode character boundaries. Definition offsets are
  deliberately **UTF-8 bytes**, including interior multibyte offsets and
  out-of-range positions.
- The bridge must not panic, return broken JSON, omit its boolean status or
  leak buffered partial stdout/stderr after failure. Check mode must not
  emit stdout/stderr. Definition success must include either a null target
  or a structured real compiler location.
- The existing interpreter budgets remain in force throughout: this does
  not bypass the source, import, output or runtime step ceilings.

## Deliberate limits

This is a **fixed-seed regression corpus**, not a coverage-guided fuzzer,
unbounded adversarial campaign, proof of absence of compiler panics, or
validation against real browser-process OOM. The native tests run inside a
single Rust test process. A panicking WASM module can behave differently,
and a process OOM may prevent the normal bridge/worker timeout from running.

Follow-up work: dedicated WASM panic investigation, isolated memory-limited
fuzz worker runs, supply-chain audits, browser-process measurements and
independent security review. Do not treat passing this suite as permission
to release Playground v1.0.0 stable.
