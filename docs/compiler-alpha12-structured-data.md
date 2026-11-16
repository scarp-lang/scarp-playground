# Published Scarp v0.0.6-alpha.12 — Playground integration

**Compiler:** https://github.com/scarp-lang/scarp/releases/tag/v0.0.6-alpha.12

**Immutable source revision:** `a1f9c2fc1c6bc8f3e04878d30d658bb38fab441d`

The version was verified against the annotated `v0.0.6-alpha.12` Git
tag and the publicly published release text on 16 November 2026. The
Playground's Cargo manifest, exact Cargo.lock git provenance, browser
compatibility metadata and lock audit all point to the **same** commit.
The tag remains a prerelease, not stable.

## New language features in the actual browser interpreter

1. **Records and destructuring.** Nominal source records with typed fields
   can be constructed and used inside functions, lists, maps and imports.
   Tuple and fixed-array patterns support nested bindings. Source-record
   field syntax and constructor behavior are determined by the Rust compiler.
2. **Variants and exhaustive matching.** Tagged payloads can be matched with
   checked `match on`/`case` arms; compiler errors are authoritative.
3. **Options and Results.** Concrete `option<T>` and `result<T,E>` support
   checked constructors, exhaustive matching and early-return propagation from
   immutable bindings with `?`. Browser snippets are syntactic helpers,
   not generic type inference or an LSP.
4. **Immutable typed lists.** `list<T>` literals and pure operations
   (`list_len`, `list_push`, `list_set`, `list_remove`) produce
   checked snapshots rather than mutating prior bindings.
5. **Deterministic maps.** `map<K,V>` has ordered integer, Boolean or
   string keys and pure `map_set`/`map_remove`/`map_get_or`/
   `map_contains` plus canonical ordered `map_keys`/`map_values`
   projections. Duplicate keys raise a compiler diagnostic rather than
   exposing partial output.

## Published examples bundled with the Playground

| Example title | Official source file | Expected behavior |
| --- | --- | --- |
| Data destructuring | `examples/data_destructure.srp` | Exact tuple/array pattern output |
| Typed records and lists | `examples/typed_dynamic_lists.srp` | Preserved snapshots, checked indexing |
| Typed immutable maps | `examples/typed_maps.srp` | Canonical key order and equality |
| Option/Result propagation | `examples/typed_propagation.srp` | Explicit successful and early error returns |
| Map projections | `examples/map_projections.srp` | Sorted key/value list projections |
| Task board across modules | `examples/projects/task-board/src/{main,board}.srp` | Real in-memory import, pure state transitions |

Source text is taken from the pinned published compiler tree, not generated
by a JavaScript mock. The task-board's two source files are exposed as
`main.srp` and `board.srp` because Playground uses a virtual
workspace, not a `scarp.project` host manifest or filesystem.

Rust bridge tests compare each program's captured stdout against the
compiler's published `.stdout`/`stdout.txt` golden file; an additional
test checks rejected duplicate map keys with **empty** stdout/stderr.
Playwright runs the actual Rust WebAssembly worker in Chromium, Firefox
and WebKit and checks representative expected outputs, multi-file imports,
static Verify and failure recovery. Older alpha.11 Decimal and alpha.10
input/array/BigInt tests are retained as compatibility gates.

## Browser execution and security constraints

The native Scarp compiler and interpreter are compiled to
`wasm32-unknown-unknown` and executed in a disposable same-origin Worker.
They are **not** the Rust-only ELF emitter or other native backend.
There is no backend server executing source code.

- 12-second per-Worker wall-clock cutoff; maximum one active compiler Worker.
- At most 12 virtual files, 64 KiB per file and 128 KiB total source.
- The bridge rejects JSON requests over 1 MiB and uses immutable pinned imports.
- Logical work: 200,000 steps; at most 1,000 selected print statements.
- Cumulative array/list/map allocation budget: **1 MiB**.
- Cumulative tuple/record/variant payload: **1 MiB**.
- Text and vector allocations retain separate 2 MiB browser budgets.
- BigInt values remain limited to 2,048 digits and 256 KiB of charged limb storage.
- Explicit UTF-8 stdin is capped at 16 KiB with 128 reads.
- `Verify code` compiles without interpreting runtime statements;
  `Check code` evaluates selected paths without exposing captured output;
  `Run code` executes the real interpreter.

These are **logical quotas**, not WebAssembly linear-memory or browser-process
RSS caps. A crash/OOM/panic may still affect the page, and the current Pages
host does not provide Worker-specific HTTP CSP headers. Follow security
issue #3; this upgrade is not approval for a stable Playground release.

## Explicit non-goals

- No native OS execution, interactive terminal prompts or filesystem access.
- No host-side data engine, generic native compilation or GUI framework.
- No claim that adding `record`/`variant` syntax permits building
  native UI apps or websites in Scarp today.
- No implicit release/tag publication. The hosted development preview
  follows `main`; its latest published Playground prerelease
  remains v0.0.2 unless separately authorized.
