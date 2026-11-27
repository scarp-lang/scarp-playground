# Scarp v0.0.7-alpha.3 browser integration

The published prerelease tag resolves to `44a3bb0a91e67570e46ce058a3f6211f8e5db0f5`.
See the [official release](https://github.com/scarp-lang/scarp/releases/tag/v0.0.7-alpha.3).

The Playground embeds the interpreter in a disposable WebAssembly Worker.
The upstream Cargo manifest is unchanged apart from its version. The bridge
lock therefore changes only the Scarp version and Git revision. Locked Cargo
tests, browser builds, end-to-end tests and dependency audits remain required.

The compatibility fixtures under `bridge/tests/fixtures/v007_alpha3` exercise:

- Exact upstream string-operator example and expected output, including raw
  strings, multiline literals, repetition and escaped newline concatenation.
- Generic functions, explicit and inferred types, contextual list inference,
  reordered named arguments, Numeric constraints and decimal precision.
- Generic Option construction and matching, Result propagation and preservation
  of an error payload.

The generic fixtures are Playground regression cases adapted from the upstream
generic-function and generic-variant tests. Verify and Check must produce no
program output; Run must match the fixture. A negative bridge test also guards
against ambiguous generic inference.

This change does not expose native ELF64 emission, native aggregate stack
layouts, native linking or bare-metal execution in the browser. It does not
change Worker quotas or authorize a stable Playground release.
