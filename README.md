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
| Scarp compiler | **v0.0.7-alpha.4** (published prerelease) |
| Pinned compiler revision | `e620bdcb512fbe909b08f1b4cc625865e4cdf339` |
| Execution mode | Browser Rust/WebAssembly in a disposable Web Worker |
| Source format | UTF-8 .srp, in-memory imports relative to the file |
| Native compilation | **Not supported** by this preview |
| Backend execution service | **None** |

The [v0.0.7-alpha.4 integration](docs/compiler-v007-alpha4.md) covers contextual nested generics, recursive calls, nested aggregate values and bounded BigInt operations in the interpreter. Native ELF64 and file-backed BigInt CLI operations remain host-only. Existing browser quotas are unchanged.

The [v0.0.7-alpha.3 integration](docs/compiler-v007-alpha3.md) adds interpreter coverage for generic functions, contextual inference, generic Option and Result payloads, and bounded string operators. Native object emission remains outside the browser.

The v0.0.7-alpha.2 integration follows the published interpreter source. Native direct calls, checked native value layouts, and the experimental ELF64 object CLI are host-only; this browser does not emit native objects, link kernels, or execute machine code directly. See [v0.0.7-alpha.2 integration](docs/compiler-v007-alpha2.md).

The v0.0.7-alpha.1 integration adds fixed-array concatenation, variadic integer
GCD/HCF/LCM, and stable vector softplus. The browser continues to enforce
its existing worker, source, input, output, and logical allocation limits.
Native ELF64 and project CLI features remain host-only. See
[v0.0.7-alpha.1 integration](docs/compiler-v007-alpha1.md).

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

The Playground offers opt-in **buffered typed prompts**: enter input lines in
the browser's Program input panel, then enable **prompt functions with
supplied input**. The real compiler can run `input()`, `input_boolean()`,
`input_integer()` and other typed prompts with the pre-supplied lines.
This does **not** open a live terminal prompt: all prompt text is captured
locally and displayed only after a successful run. The option and input
are session-only, are never stored/shared, and cannot grant a host terminal.
See [buffered prompts](docs/buffered-prompts.md).

Compiler output and diagnostics can be copied or downloaded locally without
attaching source files or ephemeral stdin. Review output before sharing it.
See [result export](docs/output-export.md).
The output panel also reports local browser turnaround time and captured UTF-8
output sizes, with an expandable explanation of execution limits. These are
not compiler CPU or memory measurements; see [browser run details](docs/browser-run-details.md).
Selected compiler limit and input diagnostics include browser-specific recovery
advice, with original compiler hints preserved. See [diagnostic guidance](docs/browser-diagnostic-help.md).

Alpha.20 pins the published compiler source at `b1a9347f93540fdf95b0ddecba4adc55a3b4bb98` and adds
browser-executable exact base-ten `d` literals, persistent tuple element
updates, and lexicographic numeric tuple comparisons. Official tuple examples
and expected output are copied from the published tag. Decimals never coerce
implicitly to binary64 floats; the Playground still executes with Rust/WASM,
not the alpha.20 Linux ELF64 native host API. See
[alpha.20 integration](docs/compiler-alpha20-integration.md).

Alpha.19 pins the published Scarp compiler source at `e534e73a81c9500e3aef9f3d51cafa0bc7bbcf75`.
The browser runs the exact upstream named-function boundary fixture alongside
alpha.17 fixed-array traversal and alpha.18 immutable array/Lifetime examples.
Alpha.19 adds Rust host-callable APIs, **not** source-level function values:
Playground cannot call those embedding APIs from Scarp source, and it does not
provide a terminal or native compiler. Rust, frontend and three-browser tests
cover the source-level execution contract. See
[alpha.19 integration](docs/compiler-alpha19-integration.md).

Alpha.16 pins the published Scarp compiler source at `244f713b4fa48f02a98b8e3e3c11025363f35260`. Two
new browser examples reproduce the upstream compiler's exact source and stdout
for bounded finite-vector median/type-7 quantiles and Unicode/64-bit integer
utilities across imported modules. Monaco exposes verified completion hints and
syntax highlighting for these functions. Native bridge checks and real three-browser
WebAssembly tests cover the exact fixtures plus atomic errors. Rust-only
constant-cache retention controls and experimental ELF64 stack handling remain
**unavailable** in the Playground. See
[alpha.16 integration](docs/compiler-alpha16-integration.md).

Alpha.15 pins the published compiler source at `a21b7b6d942bd1ca9abbbbb522f92f9c8e21e281`, preserving
the alpha.14 language, sample files, JSON diagnostic schema, and disposable
in-browser Web Worker execution. Equality and inequality of equal-length strings
now charge additional work for each started 64 UTF-8 bytes, including constant
evaluation; long comparisons can exhaust the Playground's 200,000-step limit
sooner. The upstream CLI's 1 MiB inspect-source limit, semantic-cache revision
checks, and experimental ELF64 shift kernels are **not new browser features**.
See [alpha.15 integration](docs/compiler-alpha15-integration.md).

Alpha.14 upgrades the browser to the annotated Scarp compiler source at
`43627b74af5fccccc5e233e98207413983ebafc1`, retaining the existing language and JSON contracts.
Two new exact upstream fixtures cover nested nominal patterns and deterministic
string-map key/value projections. Their source and expected output are checked
by native bridge, TypeScript and real three-browser WebAssembly tests. The
improved nested destructuring punctuation diagnostics are checked for atomic
failure. Host-only adaptive compiler caches and checked ELF64 object emission
are **not** exposed by this browser preview. See
[alpha.14 integration](docs/compiler-alpha14-integration.md).

Alpha.13 updates the Playground to the **published and annotated** Scarp
compiler source at `e755fda37cdaeed29434e848cb5dd41f2f2e7eb2`. It retains the alpha.12
language features and brings more efficient immutable Option/Result error
propagation. Four new executable examples reproduce the upstream compiler's
map/list snapshot regression fixtures, with byte-for-byte golden stdout tests.
The alpha.13 editor-generation and adaptive cache APIs are **host-side Rust
APIs**: this browser preview continues to compile each request in a fresh,
disposable Worker, with no persisted compiler graph or cache. See
[alpha.13 integration](docs/compiler-alpha13-integration.md).

Alpha.12 adds source records, tagged variants, tuple/array destructuring,
`option<T>`, `result<T,E>` and explicit `?` propagation, immutable typed lists,
and deterministic sorted maps with pure snapshot operations. Six browser
examples reproduce released fixture source including a two-module task board.
The same pinned Rust interpreter handles Verify, Check, Run, imports and
source diagnostics; no native code generator or host filesystem is exposed.
List/map storage uses the existing logical **1 MiB aggregate/array allocation
budget**, and record/variant data shares the **1 MiB tuple payload budget**;
these do not cap physical browser memory. See
[alpha.12 browser integration](docs/compiler-alpha12-structured-data.md).

Alpha.11 adds exact base-10 `decimal` arithmetic, explicit rounding and
typed module imports. The published compiler fixture executes in the real
Rust/WASM interpreter; `decimal(read_line())` uses explicit ephemeral stdin.
Host-only `input_decimal(prompt)` remains unavailable. See
[alpha.11 browser integration](docs/compiler-alpha11-decimal.md).

Alpha.10 adds immutable fixed arrays, exact BigInt operations, and EOF-aware
buffered input through `try_read_line()` / `read_line_or()`. The browser uses
an additional **1 MiB fixed-array allocation budget**; examples exercise the
published compiler's array, number-theory and Unicode input fixtures. Native
CLI interactive prompts (`input`, `ask`, `ask_or`, `--interactive`) are **not
enabled** in the browser's noninteractive Worker. Only the explicit 16 KiB
ephemeral input box supplies stdin. See
[alpha.10 integration notes](docs/compiler-alpha10-integration.md).

Alpha.9 adds exact signed `bigint` values with explicitly checked conversions,
signed arithmetic and comparisons. The Playground now embeds the released
interpreter for two real examples, including an imported typed function.
Browser execution clamps BigInt to **2,048 decimal digits** and a **256 KiB
cumulative limb reservation budget**, tighter than the native defaults.
Limits are logical accounting, not a browser process-memory cap. The new
native `scarp test --json=v2` report is a filesystem-backed CLI operation and
is **not** exposed through the Playground. See
[alpha.9 compatibility notes](docs/compiler-alpha9-bigint.md).

Alpha.8 adds typed Boolean `assert(...)` statements with optional static
messages and source-located E0065 failures. The browser uses the released
assertions through the real WASM interpreter, with a compiler-owned runnable
example and end-to-end failure tests. Its **Check code** feature still evaluates
reachable code and can trigger an assertion; this differs from the compiler's
non-executing native `verify` CLI. Alpha.8 filesystem project manifests and
`scarp init`, `scarp test`, and `scarp project info` CLI commands are not
available in the browser. See [alpha.8 integration notes](docs/compiler-alpha8-assertions.md).

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
tests and updating this compatibility table. The live compatibility badge and
Playwright boot test share `compiler-compatibility.json`; lock verification
independently checks the exact version, immutable source revision and release URL
to prevent silent version drift. The original Playground `v0.0.1` alpha archive embeds compiler alpha.3,
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

- **Download sources ZIP** exports every validated .srp file with nested relative paths and exact UTF-8 bytes. It excludes session input and results; use project JSON to preserve the selected entrypoint. See [source archive](docs/source-archive.md).

- **Module dependencies** gives a local, bounded import overview with entry reachability, missing targets, cycle members and clickable source locations. This lexical navigation aid is not compiler verification. See [module dependencies](docs/module-dependencies.md).

- React + Vite with TypeScript and Tailwind CSS, adaptive dark/light interface.
- Monaco editor with a Scarp-specific tokenizer, separate text models per
  source file (preserving per-file undo/view history), and selectable entrypoint.
- **Quick open** (Ctrl+P / Cmd+P) switches between virtual Scarp modules via
  an offline, case-insensitive filename/path search with keyboard navigation
  and mobile support. Add `:line[:column]` to a filename to jump to source,
  or use **Ctrl+G / Cmd+G** for the active file. The accessible **Go to line**
  button offers the same behavior on mobile. See [Quick Open](docs/quick-open.md).
- **Ctrl+/** (Cmd+/ on macOS) toggles Scarp `//` comments for the active line
  or selected lines. A visible **Comment / uncomment** button supports mouse
  and touch editing. Standard Monaco undo/redo, balanced-delimiter pairing,
  and a visual **word-wrap toggle** are supported without running source.
  See [editor shortcuts](docs/editor-shortcuts.md).
- **Copy source**, **Download .srp** and active-file line/UTF-8 byte counters
  provide direct module-level export and editor feedback without a server.
  See [source file operations](docs/source-file-operations.md).
- Compiler schema-v1 errors underline their real source ranges in Monaco and
  open the originating file, including imported modules. Related-source
  locations are navigable; UTF-8/Unicode-scalar positions are converted to
  Monaco UTF-16 positions rather than guessed.
- Multiple virtual `.srp` files and relative imports through the official
  `MemorySourceLoader`; not an operating-system filesystem.
- **Rename file** safely moves or renames a virtual module with a complete
  nonexecuting import-path preview, preserves relative import targets when
  changing directories, updates the project entrypoint, and supports one-step
  multi-file undo. See [file rename and move](docs/module-file-move.md).
- **Duplicate file** previews an independent copy of an active `.srp` module,
  safely rebases the copy's relative imports when changing directories, and
  supports one-step undo without touching the original sources. See
  [module duplication](docs/module-file-duplication.md).
- **Remove file** performs a nonexecuting import-dependency check before
  deleting a virtual module, refuses removal when other modules import it,
  previews entrypoint changes and supports one-step undo. See
  [safe file removal](docs/module-file-removal.md).
- **Opt-in browser-local saving:** Save locally keeps a versioned, size-limited
  multi-file workspace and selected editor tab across reloads, with automatic
  local updates while enabled. Forget saved copy removes the browser snapshot.
  No code is uploaded. Browser storage is not encrypted; do not store secrets.
  Shared URLs, imported projects and newly selected built-in examples open
  temporarily without overwriting a saved project. Choose **Save locally**
  again to explicitly replace the existing browser copy.
- Actual interpreter stdout, stderr and schema-1 compiler diagnostics.
- **Verify code** statically compiles and type-checks the module graph using the
  official Rust compiler, without running program statements or consuming input.
  It may still evaluate bounded compile-time constants; it is not a runtime
  safety proof. See [static verification](docs/static-verification.md).
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
- **Scarp alpha.16 statistics and scalar utilities:** `median`, `quantile`,
  Unicode transformations and searches, checked 64-bit bit patterns and
  integer GCD/LCM execute in the pinned Rust WebAssembly interpreter,
  not JavaScript approximations. The example browser has two exact
  upstream fixtures, including a two-file import graph.
- **Scarp alpha.11 exact decimals:** the real interpreter handles exact base-10
  operations, typed imports and explicit rounding; ephemeral stdin is supported,
  but native interactive prompts remain disabled in the browser.
- **Scarp alpha.8 assertions:** use the official Rust `assert` statement for
  typed Boolean invariants; failures return source-located E0065 errors and
  suppress buffered partial stdout, including across imported modules.
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
text allocations. The calling page terminates the worker after 12 seconds. The browser validates
workspace structure and resource ceilings before creating a Worker, and each
one-shot Worker independently validates its message before loading WASM.
Unknown operation modes are refused instead of falling back to execution;
Run failures cannot expose partial stdout/stderr, and Check/Verify cannot
return program output. See [Worker boundary tests](docs/worker-request-boundary.md).

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

## Support development

Scarp Playground remains free to use. Optional [GitHub sponsorship](https://github.com/sponsors/sanskarIN) helps support compiler integration, browser testing, documentation, and maintenance; sponsorship does not unlock execution or editor features.

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

After applying a whole-project replacement or a compiler-verified symbol rename,
**Undo bulk change** restores the previous complete workspace while it remains
unchanged. See [docs/bulk-undo.md](docs/bulk-undo.md).


Use **Shift+F12** or **Find references** to query compiler-owned symbol uses
across imported modules; unlike text search, this resolves symbol identity.
See [docs/find-references.md](docs/find-references.md).

Use **F2** or **Rename symbol** to review complete, compiler-validated
before/after changed lines across indexed `.srp` modules, then explicitly
apply the verified edits.
See [docs/symbol-rename.md](docs/symbol-rename.md).
