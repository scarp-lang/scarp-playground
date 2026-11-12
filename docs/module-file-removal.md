# Remove a Scarp file safely

The Playground's **Remove file** action is **not immediate deletion**.
It opens a nonexecuting review of the active virtual `.srp` module.

- If another file imports that module, removal is **blocked**. The review
  lists the importer path, source line and import specifier so you can edit the
  relevant references deliberately. The Playground never deletes another
  module's source to make the operation proceed.
- If the module is not referenced, the review shows the deletion and any
  required entrypoint change. Select **Confirm remove file** to apply it
  atomically. Select **Cancel file removal** to keep the workspace unchanged.
- The workspace always retains at least one source file. If you delete the
  entry file, the lexicographically first remaining file becomes the new entry.
- The operation has one-step **Undo bulk change** support. Until the next
  source edit or project change, undo restores the original exact source bytes,
  the deleted file, the original entrypoint, and the deleted file's selected
  editor tab.

The dependency check uses the same bounded Scarp import scanner as
[virtual file rename](module-file-move.md). It interprets top-level
`import "relative.srp" as name;` statements and resolves paths relative to
the importing module. A quoted import-like phrase inside a string or `//`
comment does not create a dependency. An ambiguous import, unsafe path,
malformed source or more than 120 incoming references **blocks deletion**
instead of risking the project.

This is a conservative browser-local safety check, **not** a complete
compiler analysis of all possible source syntax. It does not execute source,
read your operating-system files, upload source, or certify successful
compilation. Use **Check code** after changing the source graph. Export a
portable JSON project before important changes if you need permanent backup.
