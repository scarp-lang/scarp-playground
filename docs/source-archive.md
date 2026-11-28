# Download sources ZIP

Choose **Download sources ZIP** in the workspace toolbar to save all the
current Scarp .srp files as a standard, uncompressed ZIP archive. Nested
relative directories, empty files, UTF-8 source bytes and line endings are
preserved. Extract it using your operating system's ordinary ZIP tool.

The archive contains only source files. It does not include the selected
entrypoint, active editor tab, browser storage, program input, captured
output, diagnostics, host paths or additional metadata.
Source itself can contain sensitive text; inspect it before sharing.
Use **Export project** (JSON) if you need to restore the exact entrypoint
and selected tab to the Playground. Use **Import sources ZIP** to restore a canonical Playground export. Choose the entrypoint explicitly; the ZIP contains no editor-session metadata.

The archive is produced locally without a new package or network request.
Files must pass the existing virtual workspace path and byte limits.
Windows device names and paths or directory prefixes differing only in
ASCII letter case are refused to avoid silent extraction collisions on
case-insensitive filesystems. The original JSON export remains available.
Classic ZIP records use method 0 (stored), fixed timestamps, sorted
names and standard CRC-32 checksums. The checksum detects accidental
corruption but does not authenticate a file.

## Import validation

Only the exact canonical uncompressed ZIP format emitted by Playground is
accepted. Arbitrary ZIPs, compressed/encrypted data, ZIP64, extra fields,
comments, symlinks, non-source entries and mismatched central directories
are rejected. The bounded reader checks source sizes, safe paths, strict
UTF-8, checksums and canonical byte equality. It never extracts files to
the host filesystem or executes code. Review all files and select an
entrypoint before confirming replacement. Existing saved browser copies
are preserved. Use folder import or project JSON for other sources.
