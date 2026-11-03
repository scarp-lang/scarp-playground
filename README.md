# Scarp Playground

**The official experimental browser playground for the Scarp Programming Language.**

Write Scarp with Monaco syntax highlighting, work on multiple .srp files, inspect
real diagnostics, and run programs using the **official Rust Scarp interpreter
compiled into WebAssembly**. The application is a React/Vite/TypeScript static
site; no application server evaluates user source.

> **Release status:** v0.0.1 alpha candidate — not yet verified/published. Do
> not describe browser execution as available until GitHub Actions builds the
> Rust bridge and the Pages preview is deployed successfully.

## Compiler compatibility

| Component | Target |
| --- | --- |
| Playground | 0.0.1 alpha |
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
npm install
rustup target add wasm32-unknown-unknown
cargo install wasm-pack --locked
cargo test --manifest-path bridge/Cargo.toml
wasm-pack build bridge --release --target web --out-dir ../public/compiler
npm run lint
npm run typecheck
npm run test
npm run dev
```

Open the local URL printed by Vite. `npm run build` builds the static site.
The WebAssembly bundle is generated into `public/compiler` and is deliberately
not committed as an opaque binary; the CI builds it from a pinned compiler commit.
If `public/compiler` is absent, the editor renders but Run reports a genuine
load failure — it never fakes a successful program result.

## What v0.0.1 includes

- React + Vite with TypeScript and Tailwind CSS, adaptive dark/light interface.
- Monaco editor with a Scarp-specific tokenizer, tabs and selectable entrypoint.
- Multiple virtual `.srp` files and relative imports through the official
  `MemorySourceLoader`; not an operating-system filesystem.
- Actual interpreter stdout, stderr and schema-1 compiler diagnostics.
- Ready-to-load source examples from the compiler and embedding documentation.
- Ctrl/Command+Enter execution, source-size caps and 12-second Worker timeout.
- A shareable URL for **one short source file only**, under a 2 KiB UTF-8 limit.
- GitHub Actions typechecking, linting, JS tests, native Rust interpreter
  tests, WebAssembly compilation and GitHub Pages deployment from `main`.

Limitations: No installed packages, native executable generation, networking
from source, host filesystem, multi-file snippet sharing or production sandbox
guarantee. If a module graph is missing an imported file, the real compiler
reports an error. Browser reloads do not currently persist a multi-file project.

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

The `Playground CI and Pages` workflow builds real WebAssembly on every
feature push and pull request. After the workflow succeeds on `main`, the same
workflow deploys the static site using GitHub Pages Actions. The Pages source
must be configured to **GitHub Actions**, not branch-based publishing.

The `Publish explicitly authorized alpha` workflow is manual-only,
publishes a **pre-release**, checks version and compiler revision and packages
the built site. It must be run only after the PR merges and validation passes.
No stable release automation exists.

**Critical gate:** Do not publish v1.0.0 stable until the compiler has its
first official stable release **and** Playground passes its own security,
compatibility, accessibility and quality review. Compiler stability alone
does not authorize a Playground stable release.

For architecture and next milestones see [docs/architecture.md](docs/architecture.md).

## Community

[Scarp documentation](https://scarp-lang.github.io/scarp-docs/) ·
[Scarp by Example](https://github.com/scarp-lang/scarp-by-example) ·
[Compiler](https://github.com/scarp-lang/scarp) ·
[Issues](https://github.com/scarp-lang/scarp-playground/issues)

Licensed under [Apache-2.0](LICENSE).
