# Quick Open: switch between Scarp source files

The Playground includes a browser-local **Quick open** file switcher for
multi-module `.srp` projects.

Press **Ctrl+P** on Windows/Linux or **Cmd+P** on macOS from anywhere inside
the Playground, including the Monaco source editor. You can also click the
**Quick open** button in the workspace toolbar.

The dialog searches the virtual project's file names and relative paths.
Matching is case-insensitive. An exact filename or path ranks above partial
matches; the project entrypoint is shown first if the query is empty.

## Keyboard and pointer controls

| Action | Control |
| --- | --- |
| Open the file switcher | Ctrl+P or Cmd+P, or Quick open button |
| Find files | Type the filename or relative folder path |
| Move the active result | Up/Down arrow keys |
| Open the selected result | Enter, or click/tap a result |
| Dismiss without changing source | Escape, close button, or click outside dialog |
| Keyboard focus | Tab cycles within the open dialog |

An unmatched search shows a clear empty state rather than selecting any
file. Closing the switcher discards the query. Opening a file changes the
selected editor tab only; the project entrypoint is **not** changed, and
Scarp code is neither checked nor executed automatically.

## Privacy, validation and availability

This is an offline, in-memory filename search. It never sends source code,
path names or search queries to a server, and it does not save the query in
local storage, shared URLs or portable workspaces. Only the current
validated virtual file paths are offered; invalid or unsafe paths are not
shown. The search is bounded to 128 characters and the Playground's existing
12-file workspace limit.

Ctrl+P is deliberately captured inside the Playground, rather than opening
the browser's Print dialog. If you want to print a document, use the
browser's menu while outside the Playground.

For source navigation *inside* one file, use the Monaco editor directly.
For compiler-owned symbol navigation across files, use **F12** (definition),
**Shift+F12** (references), or **F2** (rename). Quick Open is a fast
path-based file switcher, not a language server or a filesystem explorer.
