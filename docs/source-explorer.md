# Source explorer

Open **Source explorer** from the workspace toolbar to browse virtual
folders and their .srp modules. Folders are inferred from relative
paths; no host filesystem directory is accessed. Click a folder to
expand/collapse it and a source to select its existing editor tab.

Filter by literal path text to show matching source names and their
parent folders. The search is case-insensitive, does not inspect source
content and temporarily expands matching folders without losing the
previous collapse state. The panel shows total workspace source bytes,
file count and entry/active-file indicators.

Use **New source** or a folder's plus button to review the destination
path before creation. The same safe relative-path, file-count and UTF-8
byte limits apply. Creation does not overwrite any source or change
the entrypoint, and can be reversed with **Undo bulk change**.
No source runs automatically, and the original file tabs remain available.
