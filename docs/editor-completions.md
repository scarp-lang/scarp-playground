# Editor completions

Scarp Playground offers lightweight, offline Monaco suggestions for the
**published Scarp v0.0.6-alpha.20 syntax**. Press **Ctrl+Space** in the editor
to open the suggestion list.

- Starter snippets cover immutable/mutable declarations, conditional and
  counted loops, typed `funcra` functions, imports, assertions and output statements.
- Inside an unfinished `import "` string, suggestions use
  the currently open project's actual `.srp` files.
  Import paths are displayed relative to the importing module.
- The source stays in your browser; the completion list neither calls a
  server nor executes Scarp source.
- The file name list excludes the current file and invalid source paths.

**Important:** Completions are intentionally **syntax-only**. They do not
infer local variables, type-check expressions, resolve arbitrary symbols,
inspect dependency modules, or guarantee that newly edited code compiles.
Use **Check code** and the compiler diagnostics for that. Note that
**Check code** evaluates reached assertions in the current browser bridge;
see [alpha.8 assertion behavior](compiler-alpha8-assertions.md).

The language reference and runnable examples live in
[the Scarp compiler](https://github.com/scarp-lang/scarp).


For editing shortcuts, **Ctrl+/** (Cmd+/ on macOS) comments or uncomments the
current/selected lines using Scarp's supported `//` syntax. The toolbar
also offers a comment toggle and a visual word-wrap control. See
[editor shortcuts](editor-shortcuts.md).

## Buffered prompt snippets (alpha.17/18 browser)

The static hint list includes `input`, `input_integer`, `input_boolean`,
`input_float`, `input_bigint` and `input_decimal`. These are real
published Scarp intrinsics; hints only insert source text and do not execute
code. To run prompt calls in the browser, explicitly turn on **Enable prompt
functions with supplied input** and enter all stdin lines beforehand.
Without opt-in the compiler returns E0054, and Check/Verify never acquire
an interactive reader. No host terminal or live dialog is available.

## Exact decimal literals (alpha.20)

The editor recognizes lowercase `d`-suffixed exact decimal number tokens such
as `0.1d` and offers an `exact decimal literal` starter snippet. This is
explicitly different from unsuffixed IEEE-754 floats: `0.1d + 0.2d` prints
`0.3`, while `0.1 + 0.2` retains binary64 rounding. This is syntax-only
highlighting; the compiler rejects invalid suffixes and implicit mixed types.
