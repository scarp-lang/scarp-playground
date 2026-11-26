# Scarp v0.0.7-alpha.2 browser integration

The published experimental release resolves to `638dc4c227f34f1c660be66834bcc0cbdb22dec8`.
See the [release](https://github.com/scarp-lang/scarp/releases/tag/v0.0.7-alpha.2)
and [publication verification](https://github.com/scarp-lang/scarp/blob/main/docs/releases/v0.0.7-alpha.2-validation.md).

The Playground embeds the Rust interpreter in a disposable WebAssembly Worker.
The upstream alpha.2 Rust dependency manifest has no new dependency entries;
the candidate lock update changes only the Scarp version and Git source pin.
Locked Cargo, native bridge, browser WASM and advisory checks must all pass.

Two byte-for-byte upstream source and expected-output fixtures are kept in
`bridge/tests/fixtures/v007_alpha2`. Despite their upstream native-oriented
filenames, these are ordinary Scarp source programs executed by the interpreter,
not native objects. They exercise reordered named arguments, branches, loops,
and calls with more than six arguments. Verify and Check are silent; Run must
produce the exact expected output. The native bridge and all three browser
engines exercise the fixtures.

The native-object CLI, ELF64 emission, native stack/ABI controls, bare-metal
boot, and Rust layout-planning API are not exposed by the Playground.
The existing resource budgets, Worker isolation model, and experimental status
remain unchanged. This integration does not authorize a stable release.
