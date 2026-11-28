# Compiler module inspection

Open **Compiler inspection** and select **Inspect modules** to compile
the current entrypoint and its reachable import graph. The pinned
Scarp compiler provides its own versioned module inventory, including
resolved direct imports and importers, public/private module declarations,
function signatures, parameters and generic constraints, records,
variants, constants and constant dependency sites.

This differs from the lexical **Module dependencies** panel and the
single-file parser **Source outline**. Inspection requires successful
name/type resolution of the reachable graph. It does not execute
runtime statements or consume input. Compile-time constant evaluation
is subject to the same limits as Verify. Files not reached by this
entrypoint are listed separately, with no validity claim.

Choose a resolved module, filter declarations by name, kind or
visibility, and navigate to compiler-owned positions. Parameter and
constant dependency locations use the compiler's file-local UTF-8
spans, verified against the exact source snapshot and converted to
editor UTF-16 coordinates. Source changes invalidate the result.

The bridge independently bounds serialized metadata to 512 KiB.
Browser validation supports upstream schemas 1–5, limits the total
number of symbols, members, imports and constant sites, checks graph
consistency and rejects malformed spans. Excessive metadata fails
explicitly rather than silently truncating a semantic inventory.
The shared disposable compiler worker and 12-second limit still apply.
