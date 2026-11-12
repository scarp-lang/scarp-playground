# Copy and download a Scarp source module

The editor footer provides two local-only operations for the currently active
virtual source file:

- **Copy source** copies the entire current file contents to the browser
  clipboard, including comments, whitespace and line endings. Browser
  clipboard permission may be required. If blocked, the Playground displays
  an error notice without replacing the current editor content.
- **Download .srp** saves the active module as an ordinary UTF-8 source file
  using the browser's own download mechanism. No code is sent to a backend.
  The suggested file name is the last component of the module path:
  `lib/math.srp` downloads as `math.srp`.

The editor footer also reports the **active file's source line count and exact
UTF-8 byte length**. The count treats CRLF, LF and standalone CR as line breaks
and includes a final empty line when the source ends in a newline. A Unicode
character can take multiple UTF-8 bytes, so the size may differ from the
number of visible text characters.

## Scope and privacy

These actions do **not** compile, check, execute, upload or share your source.
They work on the active file only; switching tabs changes the target.

To preserve a complete multi-file project, relative virtual paths, and entry
module selection, use **Export project** instead. That existing feature
produces a validated portable JSON project, not a standalone source file.

Downloads preserve the source string exactly, even if a work-in-progress
buffer is temporarily too large to execute in the browser. This is useful for
recovering text from an oversize editor buffer without claiming that the
compiler accepts it. No clipboard or download data is placed in local storage
unless the user separately enables the existing **Save locally** feature.
