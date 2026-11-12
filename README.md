# Scarp Playground

**The official experimental browser playground for the Scarp Programming Language.**

Write Scarp with Monaco syntax highlighting, work on multiple .srp files, inspect
real diagnostics, and run programs using the **official Rust Scarp interpreter
compiled into WebAssembly**. The application is a React/Vite/TypeScript static
site; no application server evaluates user source.

> **Latest release:** [v0.0.2 alpha](https://github.com/scarp-lang/scarp-playground/releases/tag/v0.0.2),
> published on 4 November 2026 with a verified static archive and SHA-256 checksum.
> The live experimental browser preview at https://scarp-lang.github.io/scarp-playground/
> follows `main` and may contain changes after the tagged release. The earlier
> [v0.0.1 alpha](https://github.com/scarp-lang/scarp-playground/releases/tag/v0.0.1)
> is preserved separately. **Neither release is stable or a hardened sandbox.**

## Compiler compatibility

| Component | Target |
| --- | --- |
| Playground live website | Unreleased development preview from `main` |
| Latest published Playground tag | **v0.0.2** (alpha pre-release) |
| Scarp compiler | **v0.0.6-alpha.7** (published prerelease) |
| Pinned compiler revision | `b1c1fd232b418267d95520c69ee563ac99ecae30` |
| Execution mode | Browser Rust/WebAssembly in a disposable Web Worker |
| Source format | UTF-8 .srp, in-memory imports relative to the file |
| Native compilation | **Not supported** by this preview |
| Backend execution service | **None** |

Scarp alpha.1 introduced numerical RMS and compiler-backed source
navigation. Alpha.2 added opt-in Rust caching APIs; this disposable-Worker
browser preview does **not** activate or persist those caches. Alpha.3 adds
pure, deterministic Top-K ranking and temperature-aware softmax helpers; the
Playground runs their published examples through the same interpreter.
Alpha.3's private scalar IR is not a browser native-code generator. The current development preview exposes **Go to definition** through
F12 and an accessible button, using the real Rust compiler's bounded symbol
index. It does not implement a full LSP; compiler-backed Find References is available
through Shift+F12, and conservative compiler-verified Rename through F2.

Alpha.4 publishes bounded sampled integration (`sample_area`), prefix area (`sample_cumulative_area`), secant slopes (`sample_slopes`) and finite `cosine_similarity`. Three new browser examples use official alpha.4 source and expected output. The Rust-only ELF64 object emitter is **not** exposed as a browser native compiler or CLI.

Alpha.5 adds deterministic Top-P nucleus ranking (`top_p`, `top_p_values`)
and centered Pearson correlation (`pearson_correlation`). Two new Playground
examples reproduce the official tagged source and exact stdout. These are
bounded, deterministic numerical helpers; Top-P does **not** sample random
results or run an AI model. The alpha.5 ELF64 improvement remains a narrow,
Rust host-only relocatable-object API, not a browser compiler or executable linker.

Alpha.6 adds explicit buffered `read_line()` input, six scalar/text
conversion intrinsics, and structural heterogeneous tuples. The Playground
runs these through the pinned WebAssembly interpreter, including a separate
ephemeral **Program input (stdin)** text area with a **16 KiB** UTF-8 limit.
It never reads terminal stdin or displays interactive prompts. **Check code**
still evaluates and rejects a selected input read with E0054, as the upstream
compiler specifies. The input text is not shared, exported or autosaved.
Read [the alpha.6 browser integration notes](docs/compiler-alpha6-input.md).

The earlier alpha.4 introduced offline `Scarp.project` CLI create/launch/verify
features. **Those host-filesystem commands are not available inside the
Playground:** the browser still runs Scarp modules exclusively through
`MemorySourceLoader` without OS or server filesystem access.

Do not change the compiler Git revision without rerunning the real interpreter
tests and updating this compatibility table. The original Playground `v0.0.1` alpha archive embeds compiler alpha.3,
whereas the separately tagged `v0.0.2` alpha archive embeds compiler alpha.4.
Updating `main` does not modify either historical release.

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
npx playwright install chromium firefox webkit
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
  Shared URLs, imported projects and newly selected built-in examples open
  temporarily without overwriting a saved project. Choose **Save locally**
  again to explicitly replace the existing browser copy.
- Actual interpreter stdout, stderr and schema-1 compiler diagnostics.
- **Check code** validates the entire virtual module graph and evaluates selected
  paths under the same work, print, call, capture and allocation budgets as Run,
  but never returns program stdout or stderr. The real compiler reports source
  diagnostics, including imported-module locations. Check is not a syntax-only
  parser or an external remote service.
- Numerical RMS from Scarp alpha.1, retained in the pinned alpha.7 WASM runtime.
- **Deterministic Top-K and temperature softmax** from Scarp alpha.3, with official exact-output examples verified through native Rust and real browser WASM regression tests. These are finite vector functions, not an AI model runtime or random sampling.
- **Top-P nucleus ranking and Pearson correlation** from Scarp alpha.5, with byte-exact
  official example outputs plus domain-error and Worker-recovery tests in
  the real browser interpreter. These do not provide stochastic sampling,
  model training, GPU computation or native executable generation.
- **Scarp alpha.7 expressions:** select one typed value with `if`/`elif`/`else` and
  decode `\\u{HEX}` Unicode escapes inside strings. The built-in example uses
  the published compiler fixture and runs in browser WebAssembly; these are not
  BigInt, native executable, or installed-package capabilities.
- **Rename symbol (F2 and toolbar):** inspect a complete per-file
  before/after changed-line diff and navigate to affected sources, then
  explicitly apply only after a nonexecuting recompile succeeds. The browser
  independently replays and checks all compiler-owned UTF-8 edit spans.
  Unused names, 120-site limit, no builtins, snapshot cancellation and
  restricted ASCII names are intentional safeguards.
  See [rename scope and safety](docs/symbol-rename.md).
- **Go to Definition (F12 and toolbar button)** uses the official Rust compiler's bounded, nonexecuting
  symbol index. Navigates across virtual .srp modules, preserves editor undo
  history, and translates Monaco UTF-16 cursor coordinates to Scarp's UTF-8
  offsets and Unicode-scalar source positions. Builtins have no source location.
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
- Share **complete multi-file projects** with a source-only URL fragment (8 KiB URL limit), preserving the entrypoint and selected tab. Short one-file `#code=` links remain compatible; larger projects use **Export project**.
- A production-only, restrictive browser Content Security Policy for GitHub
  Pages, allowing real Rust/WebAssembly and Monaco without permitting inline
  JavaScript, remote scripts or cross-origin fetches. See the
  [CSP review](docs/content-security-policy.md) for exceptions and limits.
- Bounded resource-pressure regression tests for the real interpreter:
  selected-output counts, buffered output, recursion, source imports and
  numerical/text stress, plus worker construction and timeout recovery. These
  are not physical process-memory limits. See
  [resource-pressure test coverage](docs/resource-pressure.md).
- Version-controlled npm and Cargo lockfiles, GitHub Actions typechecking,
  linting, JavaScript and native Rust tests, comprehensive Chromium end-to-end
  tests plus Firefox/WebKit compatibility smoke tests, WebAssembly compilation
  and gated GitHub Pages deployment from `main`.

Limitations: No installed packages, native executable generation, networking
from source, host filesystem, multi-file snippet sharing or production sandbox
guarantee. If a module graph is missing an imported file, the real compiler
reports an error. Multi-file projects persist across browser reloads only after the user
explicitly clicks **Save locally**; there is no cloud sync. The published v0.0.2 alpha includes local workspace saving, Monaco
optimization and the bounded compiler-worker protocol. The original v0.0.1
alpha predates these features.

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

Both published alphas have separate immutable tags and static website archives
with SHA-256 checksum files: [v0.0.1](https://github.com/scarp-lang/scarp-playground/releases/tag/v0.0.1)
and [v0.0.2](https://github.com/scarp-lang/scarp-playground/releases/tag/v0.0.2).
The v0.0.2 prerelease passed independent locked JavaScript/Rust checks,
WebAssembly compilation, real Chromium tests and archive checksum verification
in [the publishing workflow](https://github.com/scarp-lang/scarp-playground/actions/runs/41817109297).
The one-time automatic intent trigger is retired after publication. The guarded
release workflow is manual-only and refuses previously published tags.
No stable release automation exists.

**Critical gate:** Do not publish v1.0.0 stable until the compiler has its
first official stable release **and** Playground passes its own security,
compatibility, accessibility and quality review. Compiler stability alone
does not authorize a Playground stable release.

For architecture and next milestones see [docs/architecture.md](docs/architecture.md).
For locked npm and Cargo dependency provenance, live npm vulnerability
auditing and the limitations of this gate, see
[dependency security](docs/dependency-security.md).
For the additional fresh RustSec advisory gate on the immutable Cargo graph,
see [RustSec dependency auditing](docs/rustsec-advisory-gate.md).
For the real Chromium/Firefox/WebKit execution, CSP and recovery smoke gate see
[real-browser compatibility](docs/browser-compatibility.md).
For reproducible fixed-seed native compiler input mutations, raw JSON edge
cases and browser smoke recovery, see [compiler regression fuzzing](docs/deterministic-fuzzing.md). These tests do not
certify browser process-memory safety.
For observed Chromium process RSS, main-page JavaScript heap and real Worker
termination under bounded pressure, see [browser memory-pressure telemetry](docs/browser-memory-pressure.md).
These observations do not establish a hard memory cap.
For the portable source-only JSON format and its import threat model see
[docs/portable-workspaces.md](docs/portable-workspaces.md).

Start with compiler-verified conditionals, while/repeat loops, typed functions and
output examples in the Playground's **Example Programs** section. See
[docs/beginner-examples.md](docs/beginner-examples.md).
See the [alpha.7 compiler integration notes](docs/compiler-alpha7-conditional-unicode.md),
[historical alpha.6 input and tuple integration](docs/compiler-alpha6-input.md),
[historical alpha.5 integration gate](docs/compiler-alpha6-5-check.md),
[historical alpha.4 integration](docs/compiler-alpha6-4-check.md) and
[historical alpha.3 audit](docs/compiler-alpha6-3-check.md)
and [Go to Definition contract](docs/go-to-definition.md) for the precise
pin, safety constraints and location-mapping protocol. The
[alpha.4 integration audit](docs/compiler-integration.md) is retained as a
historical record; its compiler pin does not describe the current live preview.
A future Scarp prerelease does not automatically update Playground's engine.

## Community

[Scarp documentation](https://scarp-lang.github.io/scarp-docs/) ·
[Scarp by Example](https://github.com/scarp-lang/scarp-by-example) ·
[Compiler](https://github.com/scarp-lang/scarp) ·
[Issues](https://github.com/scarp-lang/scarp-playground/issues)

Licensed under [Apache-2.0](LICENSE).


Use **Find in project** (Ctrl+Shift+F) for bounded local text search across
all virtual `.srp` files, including clickable, Unicode-aware source locations.
See [docs/project-search.md](docs/project-search.md).

For complete preview-before-apply **literal text replacement** across open files,
use **Replace with** inside Find in project. Unlike F2 symbol renaming, this can
change comments and strings. A 120-site safety cap prevents partial changes.
See [docs/project-replace.md](docs/project-replace.md).


Use **Shift+F12** or **Find references** to query compiler-owned symbol uses
across imported modules; unlike text search, this resolves symbol identity.
See [docs/find-references.md](docs/find-references.md).

Use **F2** or **Rename symbol** to review complete, compiler-validated
before/after changed lines across indexed `.srp` modules, then explicitly
apply the verified edits.
See [docs/symbol-rename.md](docs/symbol-rename.md).
