# Compiler-backed Rename Symbol (F2)

The Playground offers a **conservative, compiler-checked rename preview** for
Scarp identifiers. It is an editor refactor, not a find-and-replace operation and
not a full language server protocol implementation.

## Use

1. Place the editor cursor on a declaration or an actual symbol use.
2. Press **F2** or choose **Rename symbol** in the editor toolbar.
3. Enter a new ASCII identifier and click **Preview rename**.
4. Examine the proposed site count and affected filenames, then click
   **Apply rename to workspace**. **Cancel rename** makes no edits.

The browser remounts Monaco models after confirmed multi-file replacements, so
the old text models cannot overwrite compiler edits. When opt-in browser local
saving is enabled, the updated workspace follows the normal autosave policy.
Otherwise the edits remain in the open session until explicitly saved/exported.

## What is renamed

The compiler's **symbol index** identifies the selected declaration and
all resolved references in the current entrypoint's imported module graph.
Supported kinds are bindings, module constants, functions, parameters (including
named-argument labels), repeat indices and import aliases. An unrelated
same-named declaration is never rewritten.

Symbols without a concrete source declaration, such as builtins, contract
result placeholders or module paths, cannot be renamed. The Playground
does **not** rewrite import filenames, strings, comments, filesystem paths,
unreachable module graphs or arbitrary text matches.

## Conservative safety model

- The whole virtual workspace must first pass the compiler's source and path
  budgets: at most 12 files, 64 KiB per file and 128 KiB total.
- New names must use 1–64 ASCII letters, digits or underscores, and start
  with a letter or underscore. The *compiler parser* also rejects keywords.
- The new name must be absent as a full identifier throughout **all** virtual
  file text, including unindexed files. This can conservatively reject names
  that appear only in comments or string literals; it prevents many silent
  capture cases without guessing scope rules.
- At most 120 compiler-resolved declaration and reference sites can be changed;
  a larger rename fails rather than silently truncating the result.
- Each compiler UTF-8 byte span must exactly match the original symbol name.
  Overlapping spans, unknown paths or stale sources are rejected.
- Before any preview is returned, the **renamed source graph is recompiled and
  reindexed without execution**. Its resolved symbol must be unique with the
  same reference kinds/count. A compiler diagnostic aborts the operation.
- Renames use a disposable 12-second Web Worker; edits/navigation/imports/runs
  invalidate pending previews. The user must explicitly apply an unchanged
  source snapshot, or no source is modified.
- A malicious compiler module, browser extension or modified runtime is outside
  this threat model. These checks do not prove general semantic equivalence of
  all possible programs or provide a hardened sandbox.

## Verification

Run the committed JS unit tests, Rust bridge tests, locked provenance checks,
WASM build and real Chromium/Firefox/WebKit end-to-end suite. Browser E2E
verifies the official cross-file import example, collision rejection, stale
preview cancellation and correct output after renaming.

This feature uses the pinned Scarp v0.0.6-alpha.7 compiler index, without a
compiler repository mutation or new Playground prerelease.
