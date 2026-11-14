# Scarp editor keyboard shortcuts

The Playground uses the real Monaco editor with Scarp-specific syntax,
completion hints and compiler-backed navigation.

## Comment or uncomment source

Place the cursor anywhere on a source line and press **Ctrl+/** on Windows or
Linux, or **Cmd+/** on macOS. To comment several lines at once, select the
lines first and use the same shortcut. Repeat it to uncomment.

You can also click **Comment / uncomment** beneath the editor, including
when using a touch device or a keyboard layout where the slash shortcut
is inconvenient. The action is available for every open Scarp source module.

- Scarp's supported line comment is `//`. The editor adds or removes it
  using Monaco's language-aware comment action, keeping existing indentation.
- Commenting or uncommenting is a normal editor change: **Ctrl+Z** (or
  **Cmd+Z** on macOS) reverses it through Monaco's per-file undo history.
- The command does **not** use compiler symbol analysis, rename, project-wide
  replacement, program execution or a server.
- Scarp does **not** gain block-comment syntax from the editor. Do not assume
  that `/* ... */` is supported by the compiler.
- A comment may make previously used declarations unavailable; use
  **Check code** to get authoritative compiler diagnostics after editing.

## Compiler diagnostics

When Check code or Run code reports a compiler error with a valid source span,
the Playground navigates to the exact Scarp location, including an imported
module. Clicking the error location or any related declaration link reopens the
reported module and focuses its actual token, not merely its tab. Repeated
clicks work even after moving the cursor. Scarp uses Unicode-scalar source
columns; the browser converts them to Monaco UTF-16 columns so locations after
emoji remain accurate. Unknown files and unsupported/malformed locations do not
navigate. Editing the source clears stale diagnostic markers.

## Other editor conveniences

| Shortcut or control | Action |
| --- | --- |
| Ctrl+/ (Cmd+/) | Toggle `//` on the current or selected lines |
| Ctrl+Z (Cmd+Z) | Undo a normal Monaco edit in the current file |
| Ctrl+Space | Show offline Scarp snippet/import completions |
| Ctrl+P (Cmd+P) | Quick Open: find a .srp module by filename/path and switch tabs |
| F12 | Compiler-backed Go to definition |
| Shift+F12 | Compiler-backed Find references |
| F2 | Preview compiler-validated symbol rename |
| Ctrl+Enter (Cmd+Enter) | Run Scarp using the browser WebAssembly worker |
| Ctrl+Shift+F (Cmd+Shift+F) | Find literal text in the entire virtual project |
| Enable/Disable word wrap | Toggle visual wrapping without changing any source bytes |
| Copy source | Copy the active module's exact source through the browser clipboard |
| Download .srp | Download the active module as a UTF-8 source file |
| Undo bulk change | Restore an applied project-wide replace, symbol rename, or file rename if still safe |
| Rename file | Preview and apply safe virtual .srp module moves with import-path updates |
| Duplicate file | Preview a separate module copy and rebase its relative imports without altering the original |

Monaco also automatically closes common balanced delimiters in Scarp source
(`()`, `[]`, `{}`, and string quotes). This is editor assistance, not
compiler code generation or a guarantee that entered source is valid.

The keyboard shortcuts operate in the Monaco source editor. When focus is
inside an unrelated text input or search box, typing follows that control's
normal behavior instead. No program source is uploaded by these editor actions.
