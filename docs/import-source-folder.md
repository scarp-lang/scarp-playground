# Import a source folder

Choose **Import source folder** in a supported browser, then select a local
project directory. The browser supplies relative paths from that directory.
The Playground strips the selected root name, preserves nested relative
.srp paths and ignores files whose names do not end in lowercase .srp.
It never reads the ignored file contents or opens arbitrary host paths.

Review the source list, UTF-8 byte count and ignored file count. Choose
the entrypoint; root main.srp is preferred, then src/main.srp, then the
first sorted source file. Select **Replace with source folder** and
explicitly confirm before replacing the workspace. Cancel leaves the
current project and program input untouched. An edit invalidates the
preview; no source is automatically run.

The picker selection is limited to 2,048 file entries before any source
read. The actual workspace is limited to 12 .srp files, 64 KiB each and
128 KiB total, with strict UTF-8 decoding and the same safe relative
paths as ordinary import. Optional UTF-8 BOMs are stripped. Any invalid
source rejects the whole selection. Manifests, binaries and dependencies
are not interpreted or executed.

A successful replacement opens a temporary source-only workspace and
clears program input. An existing opted-in browser snapshot is preserved;
choose Save locally if you want the imported project to replace it.
Use project JSON to preserve browser entrypoint metadata. Browsers without
directory-picker support can still use Add .srp files or project JSON.
