# Portable Scarp workspaces

The Playground can download and import an entire in-memory Scarp project
without a cloud account, external service or operating-system filesystem access.

## Format: `scarp-workspace.json`

The format is **source-only JSON, version 1**:

```json
{
  "format": "scarp-playground-workspace",
  "version": 1,
  "workspace": {
    "entry": "main.srp",
    "files": {
      "main.srp": "import \"math.srp\" as math; print(math.twice(21));",
      "math.srp": "pub pure funcra twice(n: integer) -> integer { return n * 2; }"
    }
  },
  "activeFile": "main.srp"
}
```

The `entry` controls the program executed by the real browser compiler.
The `activeFile` restores the editor tab; if it references a missing file,
the entrypoint becomes the active tab instead.

## How it works

1. Select **Export project** to download the JSON containing every virtual
   `.srp` source file, chosen entrypoint and current tab.
2. Select **Import project** and choose the JSON on your device. The client
   checks its format, version and source limits, then requests confirmation
   before replacing the open project.
3. Execute using **Run code**, or explicitly opt in with **Save locally** if
   this imported project should persist after reload.

Import/export does not make a network request or transmit the sources to GitHub,
Scarp, an analytics service or a server. The downloaded JSON is plain text and
**not encrypted**. Do not include credentials or other secrets.

## Validation and privacy

- Only `format: scarp-playground-workspace` and `version: 1` are accepted.
  Unrecognized or malformed files are rejected rather than guessed at.
- Serialized JSON and imported files are limited to **160 KiB**.
- The same in-memory workspace rules apply: **12 files maximum**, **64 KiB**
  per source, **128 KiB** total UTF-8 source, valid relative `.srp` names,
  and an existing entrypoint. Absolute paths, traversal and other extensions
  are rejected.
- Imported JSON is treated as untrusted data: each source must be a string,
  file names are copied into a clean map, and the sources cannot execute
  unless the user separately selects **Run code**.
- Replacing an open project requires a confirmation dialog. The browser's
  existing opt-in saved project is **not** replaced by import; autosave is
  disabled for the imported session until **Save locally** is selected again.
- No filesystem read/write permissions or `Scarp.project` CLI capabilities
  are added to the Rust/WebAssembly interpreter.
- Import/export is a source portability feature, **not** a security sandbox
  or a promise that hostile programs are safe to execute.

## Shareable project URLs

Click **Share** to copy a link that carries the complete project, including
every .srp file, the entrypoint and the selected tab. Short single-file
`main.srp` snippets continue using the original `#code=` format (2 KiB
of UTF-8 source). Other projects use a versioned, URL-encoded
`#project=` fragment containing the same portable JSON schema described
above. The complete URL is limited to **8,192 characters**.

A project over the link limit is **not truncated**: the Share action asks
you to use **Export project** and send the downloaded JSON instead.

Opening a project link validates the same paths, source sizes and portable
JSON version as an import. A malformed or excessive link is rejected.
Shared source is **not automatically executed**. Opening a link in the editor
is temporary, does not overwrite a previously saved local project, and
disables local autosave until you explicitly select **Save locally**.
Original one-file `#code=` URLs remain readable.

A URL fragment is normally not sent as part of an HTTP request to the host,
and the Playground does not upload the project to a server. **However, the
link itself contains readable, unencrypted source.** Anyone who receives it
can read that source; browsers, messaging apps, extensions or screenshots
may retain or expose the link. Never put API keys or secrets in a shared
project URL. For private or longer work use local JSON export instead.

An imported JSON file is not an automatically executed network share link.

For the compiler API and pinned WebAssembly version see
[compiler integration](compiler-integration.md). For browser runtime
resource limits see [architecture](architecture.md).
