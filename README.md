# Scarp Playground

**The official experimental browser playground for the Scarp Programming Language.**

Write Scarp with Monaco syntax highlighting, work on multiple .srp files, inspect
real diagnostics, and run programs using the **official Rust Scarp interpreter
compiled into WebAssembly**. The application is a React/Vite/TypeScript static
site; no application server evaluates user source.

> **Release status:** [v0.0.1 alpha](https://github.com/scarp-lang/scarp-playground/releases/tag/v0.0.1)
> was published on 3 November 2026. The live experimental browser preview
> is at https://scarp-lang.github.io/scarp-playground/ and follows `main`,
> so it may contain features added **after** the v0.0.1 tag. These are not
> part of that immutable release artifact. This is **not** a stable or
> production-hardened programming environment.

## Compiler compatibility

| Component | Target |
| --- | --- |
| Playground live website | Unreleased development preview from `main` |
| Latest published Playground tag | **v0.0.1** (alpha pre-release) |
| Scarp compiler | **v0.0.5-alpha.3** |
| Pinned compiler revision | `7715c28df09c7703b39e14fddb963275b25df476` |
| Execution mode | Browser Rust/WebAssembly in a disposable Web Worker |
| Source format | UTF-8 .srp, in-memory imports relative to the file |
| Native compilation | **Not supported** by this preview |
| Backend execution service | **None** |

Do not change the compiler Git revision without rerunning the real interpreter
tests and updating this compatibility table. Development main may have additional
unreleased CLI commands that this pinned release does not contain.

## Local development

Requires Node.js 22+, a current stable Rust toolchain, the
`wasm32-unknown-unknown` target and `wasm-pack`.

```sh
npm ci
rustup target add wasm32-unknown-unknown
cargo install wasm-pack --locked
cargo test --locked --manifest-path bridge/Cargo.toml
wasm-pack build bridge --release --target web --out-dir ../public/compiler --locked
npm run lint
npm run typecheck
npm run test
npm run build
npx playwright install chromium
npm run test:e2e
npm run dev
```

Open the local URL printed by Vite. `npm run build` builds the static site.
The WebAssembly bundle is generated into `public/compiler` and is deliberately
not committed as an opaque binary; the CI builds it from a pinned compiler commit.
If `public/compiler` is absent, the editor renders but Run reports a genuine
load failure — it never fakes a successful program result.

## Current development preview capabilities

- React + Vite with TypeScript and Tailwind CSS, adaptive dark/light interface.
- Monaco editor with a Scarp-specific tokenizer, separate text models per
  source file (preserving per-file undo/view history), and selectable entrypoint.
- Compiler schema-v1 errors underline their real source ranges in Monaco and
  open the originating file, including imported modules. Related-source
  locations are navigable; UTF-8/Unicode-scalar positions are converted to
  Monaco UTF-16 positions rather than guessed.
- Multiple virtual `.srp` files and relative imports through the official
  `MemorySourceLoader`; not an operating-system filesystem.
- **Opt-in browser-local saving:** Save locally keeps a versioned, size-limited
  multi-file workspace and selected editor tab across reloads, with automatic
  local updates while enabled. Forget saved copy removes the browser snapshot.
  No code is uploaded. Browser storage is not encrypted; do not store secrets.
  Shared URLs temporarily override local saved state without destroying it.
- Actual interpreter stdout, stderr and schema-1 compiler diagnostics.
- Ready-to-load source examples from the compiler and embedding documentation.
- Ctrl/Command+Enter execution, source-size caps and 12-second Worker timeout.
- **Revision-scoped execution:** Changing source, entrypoint, examples or imported
  project cancels the old disposable worker and prevents stale compiler output
  and error markers from appearing on updated code. **Stop run** cancels an
  ongoing execution; the next run uses the current source snapshot.
- **Portable project import/export:** Download a versioned JSON file with all .srp
  sources, entrypoint and selected tab, or import one after an explicit replace
  confirmation. Imported files are type/path/byte validated before use and
  do not replace a previously saved browser copy until **Save locally** is selected.
  Import/export uses only local browser file APIs; no code is uploaded.
- A shareable URL for **one short source file only**, under a 2 KiB UTF-8 limit.
- Version-controlled npm and Cargo lockfiles, GitHub Actions typechecking,
  linting, JavaScript and native Rust tests, real Chromium end-to-end execution
  tests, WebAssembly compilation and gated GitHub Pages deployment from `main`.

Limitations: No installed packages, native executable generation, networking
from source, host filesystem, multi-file snippet sharing or production sandbox
guarantee. If a module graph is missing an imported file, the real compiler
reports an error. Multi-file projects persist across browser reloads only after the user
explicitly clicks **Save locally**; there is no cloud sync. The published
v0.0.1 release predates this opt-in storage feature and the Monaco bundle
optimization; use the live website or `main` for those experimental changes.

## Safety model

All compilation and execution happens inside a short-lived Web Worker, not
the React main thread. The bridge restricts file count, source bytes, imports,
logical interpreter work, calls, output capture, numeric allocations and
text allocations. The calling page terminates the worker after 12 seconds.

**These controls are not a hardened sandbox**. They do not impose a strict
WebAssembly process-memory limit, and a browser crash may still occur with
hostile inputs. Do not paste secrets. Never add a remote execution endpoint
without a separate security design and independent review.

## Deploy and release

The `Playground CI and Pages` workflow builds real WebAssembly and runs
Chromium tests against the built interpreter on every pull request and
main-branch push. After the workflow succeeds on `main`, the same
workflow deploys the static site using GitHub Pages Actions. The Pages source
must be configured to **GitHub Actions**, not branch-based publishing.

The first [v0.0.1 alpha release](https://github.com/scarp-lang/scarp-playground/releases/tag/v0.0.1)
is published with a static website archive and SHA-256 checksum.
Its release workflow ran locked JavaScript/Rust checks, compiled the actual
WebAssembly interpreter and passed the Chromium execution tests before publication.
The one-time automatic alpha trigger has been retired; the guarded release
workflow is manual-only and refuses existing release tags.
No stable release automation exists.

**Critical gate:** Do not publish v1.0.0 stable until the compiler has its
first official stable release **and** Playground passes its own security,
compatibility, accessibility and quality review. Compiler stability alone
does not authorize a Playground stable release.

For architecture and next milestones see [docs/architecture.md](docs/architecture.md).
For the portable source-only JSON format and its import threat model see
[docs/portable-workspaces.md](docs/portable-workspaces.md).
See [compiler integration audit](docs/compiler-integration.md) for the exact
pinned compiler and source-location contract. A newer Scarp compiler pre-release
does not automatically update Playground's execution engine.

## Community

[Scarp documentation](https://scarp-lang.github.io/scarp-docs/) ·
[Scarp by Example](https://github.com/scarp-lang/scarp-by-example) ·
[Compiler](https://github.com/scarp-lang/scarp) ·
[Issues](https://github.com/scarp-lang/scarp-playground/issues)

Licensed under [Apache-2.0](LICENSE).
