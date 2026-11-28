# Local project library

Open **Project library** to store named source snapshots in the current
browser profile. This is separate from the original **Save locally**
autosave slot. Up to six snapshots can be stored, with a combined 512 KiB
decoded source limit and the original 64 KiB per file, 128 KiB per
workspace and 12-file ceilings.

Enter a name and select **Save named snapshot** to capture the current
source files, entrypoint and active tab. The name must be unique
(case-insensitive with Unicode NFC normalization). Input, prompt mode,
compiler output and arbitrary workspace metadata are excluded. Each
snapshot is a detached copy; ordinary editing and autosaving do not
modify it.

Select a saved name to preview the source paths and entrypoint. **Open
saved snapshot** asks before replacing the editor, flushes any opted-in
ordinary autosave, and opens a detached copy with cleared program input.
Use **Replace with current source** to deliberately update the named
snapshot. Rename or delete the selected name, or explicitly delete all
named snapshots. Deleting a snapshot does not delete the open editor or
ordinary autosave.

The library uses versioned source-only records in IndexedDB. Each change
is committed in one read/write transaction, comparing the exact prior
stored record before mutation. If another tab changed the library, refresh
before trying again; destructive changes are never automatically retried.
Invalid records are reported rather than silently discarded.

Storage is unencrypted, device/browser-profile specific, and subject to
browser quota, privacy settings and eviction. It is not synchronized or a
durable backup. Use Export project for an independent copy.
