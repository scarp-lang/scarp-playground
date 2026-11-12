# Rename or move a Scarp source file

The Playground offers a **Rename file** action beneath the Monaco editor for
the currently selected virtual `.srp` module. You can change just the file
name or move it to a new relative directory such as `lib/math.srp` or
`examples/main.srp`.

## Safe workflow

1. Select the file's tab and choose **Rename file**.
2. Enter a new, unused relative `.srp` path.
3. Select **Preview file rename** to examine the path change and every import
   string the Playground proposes to rewrite.
4. Only after reviewing the complete preview, select **Apply file rename**.
5. Choose **Check code** or **Run code** to validate the new virtual module graph
   using the real, pinned Scarp compiler. A source preview does not execute code.
6. If needed, use **Undo bulk change** to restore the complete original project,
   including the original entrypoint and import paths, before making new edits.

The operation updates the active editor tab and moves the `entry` path when
the renamed module was the entrypoint. It remounts Monaco models together so
the old file buffer cannot unexpectedly overwrite an updated module. Opt-in
local autosave follows the existing project-saving behavior.

## Import path updates

Scarp's in-memory loader resolves imports relative to the *importing file*.
For example, moving `main.srp` to `apps/main.srp` changes an import of
`"math.srp"` to `"../math.srp"` so it continues to point at the original
module. Renaming `math.srp` to `lib/math.srp` updates imports to the new
location. A move can require both kinds of rewrite simultaneously.

The browser's conservative source scanner processes only recognizable,
top-level `import "path.srp" as alias;` statements. It does not run a regex
over the entire project, and never rewrites `//` comments, normal string
literals, identifiers or arbitrary text. It supports Unicode source around
ASCII import strings and preserves LF, CRLF and standalone CR separators.

Source paths must follow the existing 128-character, relative `.srp`
workspace policy. Duplicate destinations, traversal outside the project,
ambiguous or unterminated import syntax, unsupported escaped import strings,
over 120 import rewrites, and source budgets that would be exceeded are all
rejected **without changing the project**.

## Safety boundaries

- The preview is local, deterministic, bounded and **nonexecuting**. It is
  not a full Scarp language server or a promise that invalid code compiles.
- For unsupported/import syntax, it fails closed rather than risking edits.
  Correct source errors and retry the move.
- Import aliases remain unchanged, because renaming a file does not rename
  the symbol by which its consumers refer to it.
- The one-step project-level undo token is kept only in memory and is invalid
  after the user edits source or switches to a different workspace.
- File rename does not read, write or rename files on your operating system
  and does not upload code. Use **Export project** to save all virtual files.
- **Rename symbol (F2)** remains a separate compiler-verified operation that
  changes identifiers, not virtual file paths.
