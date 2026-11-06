# Compiler-backed Go to Definition — Scarp v0.0.6-alpha.2

The browser loads the official compiler source at commit
`398b8ff705154a02423fe458ce3a427401e81e31` from
[the annotated v0.0.6-alpha.2 release](https://github.com/scarp-lang/scarp/releases/tag/v0.0.6-alpha.2).

- Place the cursor within a value/function/import symbol and press **F12** in
  Monaco. The browser creates a disposable worker and asks the compiled Rust
  bridge for a definition.
- The Rust bridge indexes validated virtual .srp modules through
  `modules::compile_indexed_with_loader`. It uses
  `SymbolIndex::goto_definition`; no program statements execute and no
  source is uploaded to a server.
- An identifier that refers to a compiler builtin or implicit contract result
  has no source declaration; the lookup returns `target: null`. Whitespace,
  punctuation and EOF also produce no target.
- The response contains only one target file path and Unicode-scalar range,
  **not** the full index, symbol names, source text, or all references.
- Navigation uses exact file-local UTF-8 byte offsets. Monaco cursor positions
  are UTF-16 code units; conversion rejects mid-surrogate positions and
  preserves CRLF/newline byte offsets. The target uses the existing
  Unicode-scalar-to-UTF-16 range converter.
- Navigation aborts when the workspace changes, and source markers are not
  reused across revisions. Target files must exist in the validated workspace.
- The index is additionally capped at **4,096 symbols**, **16,384 references**,
  **256 KiB retained name bytes** and **100,000 logical construction units**.
  The existing 12-file/128 KiB source limits, bounded bridge JSON, 12-second
  worker deadline and CSP remain. An E0050 index-limit diagnostic is a genuine
  compiler error. These are not hard browser process-memory limits.

## Quality gates

- Native Rust: real cross-module lookup, nonexecuting behavior,
  invalid Unicode boundaries, missing/unreachable files, compiler errors,
  E0050 capped index.
- TypeScript: Unicode coordinate conversion, strict bounded protocol, worker
  termination/cancellation, zero hosted execution.
- Playwright Chromium: actual WebAssembly F12 navigation, cross-file target
  model, preservation of source and browser origin, no fake outputs.

This is **Go to Definition**, not a language server, completion service,
incremental cache, rename engine, native filesystem bridge, or production-grade
sandbox. Indexed symbols are ephemeral per request and never persisted.
