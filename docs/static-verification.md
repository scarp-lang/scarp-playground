# Static verification without running Scarp source

The Playground offers three distinct compiler operations:

| Action | What it does | Can evaluate program statements? | Reads the stdin box? |
| --- | --- | --- | --- |
| **Verify code** | Load modules, parse, resolve names and validate types/compile-time rules | **No** | **No** |
| **Check code** | Execute selected paths with bounded interpreter validation, suppressing stdout/stderr | **Yes** | **No** |
| **Run code** | Execute the real bounded Scarp interpreter, capturing stdout/stderr | **Yes** | **Yes** |

The **Verify code** button uses the official Scarp Rust compiler's
`modules::compile_with_loader` operation in the same disposable WebAssembly
Worker as Run and Check. The compiler may evaluate bounded compile-time
constant expressions during resolution; **Verify does not interpret
program statements**. It is not a guarantee that runtime assertions, I/O,
mathematics or loops will succeed. For those, Run/Check remain necessary.

Examples:

```scarp
assert(false, "runtime failure");
```

- **Verify code:** succeeds because the statement is valid Scarp.
- **Check code:** returns a real E0065 assertion failure.
- **Run code:** returns E0065 without leaking buffered output.

```scarp
print(read_line());
```

- **Verify code:** succeeds without reading anything.
- **Check code:** reports E0054 if the read is selected.
- **Run code:** consumes only explicitly provided temporary UTF-8 input.

```scarp
print(missing_name);
```

- **Verify code:** reports compiler E0010 with exact source location.

## Validation and isolation

All three paths share the same virtual workspace and entrypoint constraints:
12 files, 64 KiB per file, 128 KiB combined source, restricted paths, 1 MiB
request JSON and bounded module imports. Worker execution is terminated by the
same 12-second timeout and source-revision cancellation. Verification has no
host filesystem, network execution service, terminal, or persistent stdin.

The browser additionally rejects any unexpected stdout or stderr in a
verification reply. Compiler diagnostics retain schema v1 byte spans and
Unicode-scalar coordinates for accurate Monaco navigation.

**Limitations:** Verify is *compiler verification*, not a static proof
of runtime safety; compiled constants may still be evaluated at compile time.
Logical quotas and disposable Workers are not a hardened browser sandbox.
Do not paste secrets, and do not treat a passing Verify as a stable-compiler
or production-release certification.

## Acceptance

Rust bridge unit tests assert that Verify does not trigger reachable assertions,
buffered reads or invalid runtime decimal constructors, yet rejects invalid
source and missing imports. Playwright tests execute the actual Rust/WASM bridge
and compare Verify, Check and Run semantics across the supported browser suite.
The project remains an unreleased development preview after this feature.
