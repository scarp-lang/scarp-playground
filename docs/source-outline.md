# Compiler-owned source outline

Open **Source outline** and select **Refresh outline** to parse the
active source using the published Scarp parser through the real WASM
bridge. It works on a single source file, even when imports or names
cannot resolve. A syntax error is shown instead of a fabricated outline.

The outline lists actual declaration tokens for functions, type and
value parameters, records and fields, variants and cases, import aliases,
bindings, repeat indices and match bindings. Public markers and nesting
come from the parsed syntax, not inferred visibility or type resolution.
Filter by name or declaration kind and click a result to navigate to
its verified file-local byte position converted to Monaco coordinates.

The request does not resolve imports, evaluate constants, run statements,
consume stdin or access a filesystem. It uses the existing disposable
worker and 12-second wall-clock limit. The display is capped at 256
entries and 128-byte names; an incomplete result is labelled. Source
changes invalidate previous results. Use Verify for semantic checking
and Go to Definition for resolved symbol identities.
