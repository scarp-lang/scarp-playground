# Compiler v0.0.6-alpha.6 — browser input, text and tuples

This historical change upgraded the Playground's **development branch** to the exact
published compiler release commit `cdf6a3924ec2a36c7beca5a9aec4f01a0bce515e` (not a
moving tag or branch). This is a prerelease, not a stable language contract.

## New functionality

- `read_line()` consumes one line of UTF-8 from **Program input (stdin)**,
  a separate textarea. Each Run gets a new immutable text snapshot.
- The compiler's alpha.6 scalar conversions (`text_to_integer`,
  `text_to_float`, `integer_to_text`, `float_to_text`)
  and Unicode text helpers (`text_trim`, `text_replace`)
  work in the existing interpreter.
- Immutable structural `tuple<...>` values, projected with literal
  indices (`pair[0]`), use a separate **1 MiB tuple payload cap**.
- Three new beginner examples use the published compiler input fixture and
  tag-compatible tuple/text expressions.

## Safety and behavior

- Source modules remain limited to **12 files, 64 KiB each, 128 KiB total**.
- Input has a stricter **16 KiB UTF-8 total/line cap** and **128 read calls**.
  The compiler also enforces its existing execution, output, text, vector and
  work quotas. The browser can stop a disposable Worker after 12 seconds.
- The worker calls `ModuleProgram::execute_with_input` using a Rust
  `Cursor` over the supplied byte string; no terminal, user file,
  server, package download or external API is available to Scarp code.
- **No interactive prompt:** compiler output is buffered until execution
  succeeds. `read_line()` sees a finite, prefilled input stream.
- **Check code** continues to evaluate selected paths, but the compiler
  deliberately refuses input in that mode (**E0054**). Use Run to consume input.
- Input is **not** in the workspace format, share links, exported JSON or
  browser local autosave. It resets on project import/share navigation and
  on page reload. Avoid pasting private information even into a local tool.
- EOF before a new line is a real **E0055** diagnostic; no fake blank line
  is synthesized.

## Verification gates

Review and pass the repository CI before merging. It runs locked npm audit,
locked Cargo dependency integrity and RustSec audit, native Rust tests,
wasm-pack's real interpreter build, TypeScript checking, unit tests and real
Chromium/Firefox/WebKit end-to-end tests. Test exact Unicode stdout, input
quotas/EOF, check-mode diagnostics, pure tuple/text code and pinned release
metadata. Do not retag older Playground releases.

See the [official release](https://github.com/scarp-lang/scarp/releases/tag/v0.0.6-alpha.6),
[program input](https://github.com/scarp-lang/scarp/blob/v0.0.6-alpha.6/docs/program-input.md),
[text foundations](https://github.com/scarp-lang/scarp/blob/v0.0.6-alpha.6/docs/text-foundations.md)
and [tuple contract](https://github.com/scarp-lang/scarp/blob/v0.0.6-alpha.6/docs/tuples.md).
