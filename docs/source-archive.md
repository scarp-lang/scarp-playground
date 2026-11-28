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
and selected tab to the Playground. Use **Import sources ZIP** to restore a canonical Playground export or compatible ordinary ZIP. Choose the entrypoint explicitly; the ZIP contains no editor-session metadata.

The archive is produced locally without a new package or network request.
Files must pass the existing virtual workspace path and byte limits.
Windows device names and paths or directory prefixes differing only in
ASCII letter case are refused to avoid silent extraction collisions on
case-insensitive filesystems. The original JSON export remains available.
Classic ZIP records use method 0 (stored), fixed timestamps, sorted
names and standard CRC-32 checksums. The checksum detects accidental
corruption but does not authenticate a file.

## Import validation

The canonical reader remains unchanged. Ordinary classic ZIP files may also contain stored or raw-DEFLATE sources, directory entries, bounded comments and well-formed metadata fields. Compressed source support depends on the browser's native DecompressionStream; unsupported browsers get an explicit error and may use a stored ZIP or folder import. Non-source regular files are counted but never decompressed or imported.

The reader caps raw archives at 512 KiB and directory entries at 256, and retains the existing 12-file, 64 KiB per-source and 128 KiB aggregate limits. Central and local paths, methods, sizes, descriptors and offsets must agree; local ranges must be contiguous and non-overlapping. Unsafe relative paths, case collisions, special files, encryption, ZIP64 and alternate Unicode path fields are rejected. Every source is decoded strictly as UTF-8 and checked against its CRC and declared size. Decompression is cancelled on excess output. No files are extracted to the host filesystem, and no code runs automatically. Review and choose an entrypoint before confirming replacement. Existing saved browser copies are preserved.
