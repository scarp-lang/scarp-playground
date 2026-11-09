# Architecture and integration assessment — 2026-11-03

> Historical architecture baseline. The November 7 snapshot described
> compiler **v0.0.6-alpha.3** at `ceff07d9014f466974e0c9e02fc5d23573f55777`,
> not the latest development source. See the
> [alpha.5 compatibility candidate](compiler-alpha6-5-check.md) for its exact
> compiler pin and required live-browser verification before deployment.
> Historical measurements and source comparisons below retain their original
> dates; current compiler-backed navigation behavior is described in
> [Go to Definition](go-to-definition.md).

## What was inspected

- `scarp-lang/scarp-playground`: initially only `.gitignore` and Apache-2.0 license.
- Official compiler is **`scarp-lang/scarp`**, not `scarp-lang/scarp-lang`.
- Published compiler v0.0.5-alpha.4 commit
  `79141329176f5dce51457e90a6652902f6432135` (source pinned, not a floating branch).
- Public Rust APIs `scarp::modules::{MemorySourceLoader, compile_with_loader}`,
  `ModuleProgram::execute`, `ExecutionOptions`, `ModuleDiagnostic::write_json`.
- The Rust package has no third-party compiler dependencies and is not
  published to the Rust registry; a pinned Git dependency is required.

## Execution design

```text
React workspace (files + entrypoint)
  -> validate virtual paths / UTF-8 byte limits
  -> disposable browser Web Worker (12s wall-clock cutoff)
  -> wasm-pack JS glue / WebAssembly
  -> Rust bridge (JSON request and response)
  -> published Scarp module loader + parser + resolver + interpreter
  -> real stdout, stderr, diagnostic JSON
  -> terminal pane and source location display
```

Each browser run is also associated with a monotonically increasing editor
revision. Source edits, entrypoint changes, file additions/removals, example
replacements, hash navigation and project import invalidate the prior run and
abort its Worker. Late Promise completions cannot apply their results or
markers to a new revision. The **Stop run** control provides explicit
cancellation. The existing 12-second timeout and Rust resource budgets remain
in place; aborting a Worker does not establish a hardened sandbox.

The v0.0.1 proof-of-concept successfully compiled the pinned Rust interpreter
to WebAssembly in GitHub Actions and deployed it on GitHub Pages on
2026-11-03. The production app does not use a JavaScript parser or fake output
fallback. A browser-loading or runtime failure is reported transparently.

The new Playwright CI gate validates actual execution in headless Chromium:
hello output, relative imports, compiler diagnostics, work-budget failures,
theme persistence and a mobile viewport. A green TypeScript/WASM build alone
is no longer enough to ship a revision.

`MemorySourceLoader` maps portable relative source paths into an isolated
in-memory map. It does not expose OS files. The code uses compiler module
diagnostic schema 1 (UTF-8 byte spans and 1-based Unicode-scalar columns).

## Known risks and limits

- Default Rust/WASM linear memory may grow independently of the compiler's
  logical execution quotas. Browser worker termination is the final timeout
  control, not a formal security boundary.
- The pinned compiler builds on `wasm32-unknown-unknown`, but subsequent
  compiler changes must independently pass real browser tests.
- Output is captured only after successful interpreter preparation, following
  the compiler's real semantics.
- GitHub Pages is static; server-side execution, shell access and persistent
  filesystem operations are intentionally absent.
- Npm and Cargo dependencies are locked in `package-lock.json` and
  `bridge/Cargo.lock`; CI uses `npm ci`, `cargo test --locked` and
  `wasm-pack build --locked` to reject unreviewed resolution changes.
- Multi-file source is supported and can be saved locally **only after explicit
  opt-in**. Saved workspaces are versioned, validated and byte-limited on
  load and save. The browser can clear this unencrypted storage; no remote
  persistence or sync exists. A shared URL never silently overwrites saved code.
  URL sharing still supports a single small source file.
- Monaco tokenization is an editor convenience; actual Scarp syntax is
  determined solely by the pinned compiler.

## Near-term milestones

1. Keep all locked builds and Chromium execution tests green after compiler
   and dependency upgrades; test on Firefox/WebKit separately when feasible.
2. Extend browser accessibility, editor keyboard, diagnostics and failure tests.
3. Add persistent virtual projects and multi-file share/import/export flows.
4. Add Monaco markers, exact source-span repair suggestions and richer docs.
5. Conduct independent security review before stable; a stable compiler by
   itself is not a release authorization.

## Monaco bundle optimization (post-alpha development)

The initial v0.0.1 build imported the `monaco-editor` package root.
That generated many unrelated syntax-language chunks (for example Python,
TypeScript, Java and SQL) even though Playground edits Scarp exclusively.

Development now uses the editor ESM API and editor feature registrations
without bundled stock language packs. The editor is lazy-loaded with a React
Suspense placeholder, keeping the initial shell separate from Monaco. A post-build script reports the JS
asset count, byte sizes and gzip sizes, and fails CI if unrelated language
chunks return. Playwright verifies real editable Monaco input and Scarp
compiler execution. Internal Monaco ESM entrypoints must be rechecked on
dependency upgrades; keep the pinned tested editor version until then.

Verified GitHub Actions measurements (same pinned dependencies, 2026-11-03):

| Metric | v0.0.1 starting build | Optimized PR #8 |
| --- | ---: | ---: |
| Transformed modules | 1,082 | 889 |
| Generated JS asset files | 88 | 4 |
| Generated JS, raw | ~4.32 MB | ~3.71 MB |
| Initial application JS | ~3.54 MB | 0.235 MB |
| Initial application JS, gzip | ~925 KB | ~74 KB |
| Chromium real-browser checks | 6 | 7 |

These are build asset sizes, not network/wall-clock measurements. Monaco's
~3.24 MB chunk still loads when the editor is mounted. Runtime performance
must be separately measured on actual devices; these figures must not be
presented as a promise of a given load time.

## Release version accuracy

The original [v0.0.1 alpha](https://github.com/scarp-lang/scarp-playground/releases/tag/v0.0.1)
remains a historical snapshot that embeds compiler `v0.0.5-alpha.3`.
The second [v0.0.2 alpha](https://github.com/scarp-lang/scarp-playground/releases/tag/v0.0.2)
was published on November 4, 2026 from commit
`8607773cdae7ec40602784a740a29636d399ca76`; its official compiler
is pinned to `v0.0.5-alpha.4` at source commit
`79141329176f5dce51457e90a6652902f6432135`.

The v0.0.2 release incorporates Monaco optimization, opt-in browser-local
projects, portable JSON import/export, source-aware diagnostics, stale-run
cancellation and bounded compiler-worker request/response validation. Its
release workflow independently passed locked JavaScript/Rust tests, the real
WebAssembly build and the complete Chromium suite before producing a versioned
website archive and SHA-256 checksum. GitHub Pages deploys `main` rather than
a release tag, so it can contain subsequent changes; the UI deliberately says
**Development preview** rather than misrepresenting a specific tagged archive.

The upstream alpha.4 `Scarp.project` commands operate on the host filesystem
and are **not exposed** in the Playground's browser-only, in-memory runtime.
Neither alpha is a hardened security sandbox. The original v0.0.1 archives
and source commit are unchanged; no stable v1.0.0 release is authorized.
