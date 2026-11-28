# Module dependencies

Open **Module dependencies** from the workspace toolbar to inspect the current
virtual project without running Scarp or contacting a server. The overview
lists files, UTF-8 source bytes, incoming and outgoing import statements,
and paths reached by the scanned imports from the selected entrypoint.

Click a filename to open it. Click an import location to jump to the
source path and column, or click an existing destination to open that
module. The panel updates from the current workspace when sources or the
entrypoint change. It does not mutate sources, save data or read program input.

The conservative scanner recognizes ordinary, raw and triple-quoted literals,
ignores import-shaped text in comments and strings, and normalizes simple
relative paths. Missing paths and unsupported spellings are distinguished.
A cycle label means a directed cycle is present in the scanned graph,
including self-imports and disconnected cycles.

This is a lexical navigation aid, not a compiler dependency graph or a
license to delete files. Unsupported paths, malformed strings and the
independent 120-import display limit make the scan partial. In that case
unvisited files have unknown reachability. Verify code for authoritative
compiler diagnostics; the existing module removal preview is separate.
