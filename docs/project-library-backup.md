# Named library backup and restore

The project library can download all named source snapshots as a separate, versioned JSON file. It excludes current unsaved editor state, ordinary autosave, program input, results and preferences. The file is unencrypted and should be reviewed before sharing.

Restore previews incoming names, source counts, entrypoints and conflicts. New names are selected by default; identical and conflicting names are skipped unless explicitly changed. You can import under a new name or replace an existing conflicting snapshot. The six-project and combined source-byte limits still apply. The final merge is validated and committed in one IndexedDB transaction with an exact prior-record comparison, preventing stale cross-tab writes. No editor source is changed and no program runs automatically.
