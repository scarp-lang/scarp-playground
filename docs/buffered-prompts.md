# Browser buffered typed prompts — experimental

## Model and scope

Scarp's published interpreter supports `input(prompt)`,
`input_boolean(prompt)` and other typed prompt intrinsics through
`execute_with_interactive_input`, which accepts a caller-owned reader
and output writer. The Playground implements an opt-in, **non-live** mode:
enter all input lines beforehand, check **Enable prompt functions with
supplied input**, and select Run. Prompts are captured to memory, not
displayed while the Worker is executing.

The official Scarp alpha.17 Boolean prompt source and `.stdin` fixture
are exposed as the **Typed Boolean prompts** example. It enables the option
only when explicitly selected. All other examples use the default off mode.

## Safety and compatibility boundary

- The same 16 KiB UTF-8 stdin ceiling, 128 input reads, execution quotas,
  12-second browser timeout, single concurrent compiler Worker and fresh
  Worker-per-request behavior apply.
- A separate Rust `BrowserCapture` gives both stdout and stderr one shared
  1 MiB in-memory limit. Interactive prompt writes are immediate in the Rust
  API, so without this limit they could bypass normal buffered output quotas.
- Errors (including malformed Boolean input) return neither captured
  prompt text nor partial stdout/stderr. Prompt text is only returned after
  a successful Run.
- The optional `allowPrompts` flag is valid only for Run. Check, Verify,
  Definition, References and Rename reject it before reaching WASM.
- The mode is disabled by default. Switching to shared/ported/saved projects
  resets it. Nothing can access browser dialogs, a process terminal, a host
  filesystem or network for input.
- The input editor counts **UTF-8 bytes**, not JavaScript characters. It accepts
  exactly 16 KiB, including Unicode, and rejects an over-budget typing or paste
  event atomically without modifying previous input or clearing a valid result.
  This editor guard complements (and does not replace) Rust/Worker validation.
- Both the mode and input lines are ephemeral: they are not persisted to
  local storage, appended to a shared URL, or exported in project JSON.
- Run is not a true interactive REPL. If the program needs another value
  not supplied before execution, it terminates with a source-mapped error.
  Check and Verify stay noninteractive and never read the input buffer.

## Verification

Rust bridge regression tests enforce exact upstream Boolean prompt
source/stdin/stdout parity, E0054 opt-in, E0084 malformed input, EOF,
atomic rollback and shared capture bounds. Vitest validates worker
request shapes, frontend forwarding, and sample fidelity. Playwright
exercises the real WASM runtime and temporary UI input on Chromium,
Firefox and WebKit.

No new compiler dependency or native process execution is added.
