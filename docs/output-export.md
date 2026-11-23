# Export compiler output locally

The **Output** panel offers **Copy result** and **Download result** after a
program produces stdout, stderr, or a compiler diagnostic. Downloads are UTF-8
text named scarp-result.txt; clipboard access requires an explicit click.

- One output stream is preserved byte-for-byte, including Unicode and line
  endings. When both stdout and stderr exist, each stream is labelled, not
  presented as a single chronological event log.
- Compiler failures, including compiler-backed navigation and rename failures,
  export the true operation name, diagnostic code, source location, message,
  hint, and any related diagnostic locations. The real compiler protocol
  atomically rejects failed results that contain partial stdout or stderr;
  the Playground does not promise partial output recovery after a failure.
- Silent successful Run, Check and Verify operations offer no export.
  Output actions are disabled while compiling and after clearing results.
- Exports contain no attached source files, workspace JSON, or saved stdin.

**Privacy:** Program output and compiler error messages can themselves include
sensitive strings. Review the result before sharing it. Neither copying nor
downloading sends it to a Playground server or writes it into local storage.
If clipboard permission is unavailable, use Download result instead.
