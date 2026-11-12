# Project-wide find and replace

Open **Find in project** (or press **Ctrl+Shift+F** / **Cmd+Shift+F**).
Enter at least two characters in the search field and an optional **Replace
with** value. Choose **Match case when replacing** only when you need an exact
case match. Click **Preview replacements**.

The panel shows **every changed line** as full before/after source text,
grouped by path and source line, including multiple replacements on one line.
Long lines scroll horizontally. Nothing changes until you explicitly choose
**Apply all replacements**. **Cancel preview** leaves source untouched.

## Guarantees

- The operation is entirely inside the browser; no server requests, uploads,
  compiler execution or program evaluation occur during preview.
- Search and replacement are **literal text**, not regular expressions or
  interpolation. Replacement values such as \`$&\` and \`\\\` stay literal.
- Search is case-insensitive by default, with optional case-sensitive
  replacement. The ordinary Find results remain case-insensitive.
- At most **120 actual text changes** may be applied. Projects requiring more
  matches are rejected **completely**, never silently truncated.
- The search query is **2–96 characters**, and replacement text is **0–256
  characters**. Both must fit on one line; an empty replacement deletes text.
- The original line endings (\`CRLF\`, \`LF\` or \`CR\`) and unrelated files
  are preserved exactly.
- The result must satisfy the same **12-file**, **64 KiB per file**, and
  **128 KiB project-wide** limits as Scarp execution.
- Editing source, changing the search or replacement text, loading another
  project, or changing the case option discards a stale preview.
- Applying changes is atomic at the React workspace level, followed by a
  fresh editor mount so old Monaco models cannot overwrite secondary files.

This is a text editor feature; it **does not understand Scarp symbol identity**.
Text replacements can change strings, comments and unrelated identifiers.
For a compiler-validated rename of declarations and references, use **F2 /
Rename symbol** instead. Run **Check code** after applying plain-text edits to
verify that the resulting Scarp program remains valid.

Saved local copies follow the existing explicit opt-in policy. The preview
itself is ephemeral and is not exported, shared or persisted.
