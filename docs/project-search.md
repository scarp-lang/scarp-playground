# Find in project

Use **Find in project** in the workspace toolbar, or **Ctrl+Shift+F**
(**Cmd+Shift+F** on macOS), to search all open virtual `.srp` source files.
Select a result to open the file and move the Monaco cursor to that match.

- Search is **literal** and **case-insensitive**. A period or bracket is not
  treated as a regular-expression operator.
- Enter at least two characters; queries are limited to **96 characters**.
- The panel lists at most **80 matching locations** and indicates truncation.
- Results are sorted by file path, then line and column. Columns use UTF-16
  code units, the same model Monaco uses for emoji and other Unicode text.
- No source is sent to a server, compiled, uploaded, or indexed remotely.

Project search is a plain text convenience, **not** a compiler symbol index
or semantic find-references feature. Use **F12** for compiler-backed Go to
Definition, and **Check code** for authoritative compiler diagnostics.

Searching does not change local browser-saved workspaces or the current
shared-project session.


For text changes across multiple files, choose **Replace with** in the same
panel and review every proposed line before explicitly applying the result.
See [project-wide replace](project-replace.md). This is plain text editing,
not a compiler-validated symbol rename.
