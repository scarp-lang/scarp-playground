# Editor completions

Scarp Playground offers lightweight, offline Monaco suggestions for the
**published Scarp v0.0.6-alpha.5 syntax**. Press **Ctrl+Space** in the editor
to open the suggestion list.

- Starter snippets cover immutable/mutable declarations, conditional and
  counted loops, typed `funcra` functions, imports and output statements.
- Inside an unfinished `import "` string, suggestions use
  the currently open project's actual `.srp` files.
  Import paths are displayed relative to the importing module.
- The source stays in your browser; the completion list neither calls a
  server nor executes Scarp source.
- The file name list excludes the current file and invalid source paths.

**Important:** Completions are intentionally **syntax-only**. They do not
infer local variables, type-check expressions, resolve arbitrary symbols,
inspect dependency modules, or guarantee that newly edited code compiles.
Use **Check code** and the compiler diagnostics for that.

The language reference and runnable examples live in
[the Scarp compiler](https://github.com/scarp-lang/scarp).


For editing shortcuts, **Ctrl+/** (Cmd+/ on macOS) comments or uncomments the
current/selected lines using Scarp's supported `//` syntax. The toolbar
also offers a comment toggle and a visual word-wrap control. See
[editor shortcuts](editor-shortcuts.md).
