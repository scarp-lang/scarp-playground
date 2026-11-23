# Add local Scarp source files

Use **Add .srp files** to bring ordinary local Scarp modules into the current
Playground workspace without first constructing a Playground JSON project.

Select one or more `.srp` files in your browser's file picker. Files are added
under their **basename** at the virtual workspace root (for example
`math.srp`), not uploaded to a server. The current entrypoint and every
existing source file stay unchanged. The editor opens the first imported file;
switch back to your entry file to add the appropriate `import` statement.

- All files are read and validated before any source is added. If one is
  invalid, conflicts with an existing file, or duplicates another selected
  filename, **the entire batch is rejected**; there is no partial import.
- File names must follow the Playground's safe relative `.srp` path rules.
  Imported picker files use their basename, so nested paths are not recreated.
  To organize modules in a directory, use **Rename file** afterward and
  review its import-rewrite preview.
- Only strict UTF-8 text is accepted; an optional UTF-8 BOM is stripped.
  Unicode characters and existing LF/CRLF line breaks remain unchanged.
  File reads are bounded to 64 KiB each, 128 KiB total sources and 12 files
  per virtual workspace.
- A successful import can be reversed with **Undo bulk change** until the
  next source edit or project change invalidates that in-memory undo token.
  Neither importing nor undoing compiles or executes code automatically.
- An import does not enable browser autosave and does not attach program input
  (stdin). Use **Save locally** to opt into browser-only persistence, or
  **Export project** to save all modules and virtual paths as JSON.

**Compiler compatibility:** This is a source-file convenience feature for
the browser's existing `.srp` virtual workspace. The official Scarp CLI
uses lowercase `scarp.project` for project manifests. The Playground does
not import or execute these manifests, resolve native file systems, or act
as a CLI project manager.

For whole-project replacement and retaining virtual directory paths, use
[portable workspace JSON](portable-workspaces.md). For downloading the
current source buffer, see [source file operations](source-file-operations.md).
