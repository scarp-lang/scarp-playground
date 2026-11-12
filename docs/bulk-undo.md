# Undo a bulk change

The Playground keeps one **ephemeral, in-memory** undo snapshot after an
explicitly applied **project-wide text replacement** or compiler-verified
**symbol rename**. The toolbar's **Undo bulk change** button restores all
affected source files together, including source line endings and the original
entry point. It never runs Scarp code.

- Undo is available **only for the most recent bulk change**. There is no
  history stack or redo operation in this preview.
- The button is disabled until a bulk operation has actually been applied.
  Previewing and cancelling a change do not create an undo snapshot.
- Editing any source, changing file membership/entry, or opening another
  workspace invalidates the undo snapshot. Undo never silently discards work
  performed after the bulk edit.
- Switching the active file, running or checking code, and viewing output do
  not change the underlying project snapshot; the undo option remains usable.
- The original and updated workspaces must both satisfy the same existing
  source and path size budgets. The before/after file membership and entry
  must match. No-op edits cannot create an undo snapshot.
- The snapshot remains only in memory. It is **not** included in exported
  projects, share links, browser local storage, or compiler requests.
- If opt-in local autosave is enabled, restoring the source is a normal
  workspace update and is saved on that browser through the existing policy.

Monaco's single-file undo stack cannot reliably reverse an atomic change to
multiple virtual files. This explicit project-level undo is separate from
regular typing undo. It performs the same editor-model remount used by bulk
apply, preventing obsolete Monaco buffers from overwriting restored modules.
