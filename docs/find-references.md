# Compiler-backed Find References

Scarp Playground's **Find references** command (Shift+F12 in Monaco)
uses the published Scarp **v0.0.6-alpha.6** symbol index, not a text
search or an AI guess.

Place the cursor inside a resolved symbol and press Shift+F12, or select
**Find references** from the editor footer. The result panel shows its
declaration separately and lists actual read/write/call/namespace/import
reference sites across all reachable virtual `.srp` modules.
Select a site to open the file at the compiler-owned location.
**Previous** and **Next** cycle through results, wrapping at either end.
The panel announces the selected result, marks it in the list, and highlights
compiler-owned references in the currently open Monaco tab. The current site
is visually distinct from other occurrences. Switching tabs updates the
decorations; editing source clears them so stale results cannot persist.

Implementation and limits:

- The browser invokes `modules::compile_indexed_with_loader` in a
  fresh disposable Rust/WebAssembly Worker. It **never executes program
  code**, reads input, or opens a host filesystem.
- The index is bounded to **4,096 symbols, 16,384 indexed references,
  256 KiB symbol names, 100,000 construction work units**.
- A result includes at most **120 references**, with an explicit truncated
  indicator. No full index or user source is included in the bridge reply.
- A reference is associated with the exact compiler symbol ID. Two
  identically named bindings in different scopes are not conflated.
- The compiler's source locations are one-based Unicode-scalar coordinates,
  converted to Monaco UTF-16 positions before navigation.
- The worker shares Run/Check's single concurrency slot, 12-second timeout,
  cancellation on source edits, and content-security restrictions.
- Index compilation failures produce real compiler diagnostics. Builtins
  can have references without a source declaration. Unreachable files are
  outside the compiled module graph.
- Nothing is uploaded or persisted. The result list is invalidated on edits,
  project switching, or a new run.

**Plain text search** (Ctrl+Shift+F) is still available separately for
searching comments and uncompiled source. Find References only operates
on source that compiles successfully.

This is not general Rename Symbol, a full LSP service, or a production sandbox.
