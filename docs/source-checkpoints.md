# Temporary source checkpoint

Open **Source checkpoint**, then select **Capture checkpoint** to keep a
detached copy of all source files, entrypoint and active source path in
this tab's memory. It contains no program input or execution results.
Capture is explicit and replacement of an existing checkpoint requires
confirmation.

The comparison lists added, removed, modified and unchanged paths,
UTF-8 byte counts and entrypoint changes. Select a changed file for
a line-numbered diff that distinguishes CRLF, LF, CR and missing final
line endings. A bounded LCS comparison is used for small changes;
large regions use a labelled simplified preview. Unchanged context,
long lines and excessive rows may be omitted from display. The diff
is never applied as a patch.

Restore checkpoint replaces the exact source map and entrypoint only
after confirmation, leaving input unchanged. It is reversible with
**Undo bulk change** until the next source edit. If local source saving
is enabled, the normal autosave updates the saved copy after restoration.
A checkpoint can be discarded explicitly and is lost on page reload;
it is not a backup or a persistent version history. Use project JSON
export for durable source copies.
