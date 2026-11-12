# Real-browser compatibility gate — November 6, 2026

This is a reproducible browser-compatibility smoke suite for the **current
development preview** of Scarp Playground. It uses the pinned official Scarp
Rust interpreter compiled to WebAssembly. It does not use fake compiler
responses, JavaScript interpretation or an application backend.

## Browsers and scope

- **Chromium:** all existing Playwright end-to-end specs plus the shared
  `compatibility.spec.ts` cases.
- **Firefox:** the shared compatibility spec under the production preview URL.
- **WebKit:** the same compatibility spec and production preview URL.

Each browser must load Monaco, obey the built page's meta Content Security
Policy (including rejection of inline JavaScript), execute authentic WASM,
validate and execute imported virtual modules, preserve Unicode-aware compiler
diagnostics and recover from a deterministic interpreter output-budget failure.
The alpha.8 shared smoke test additionally checks that Boolean assertion
failures report E0065 without leaking partial stdout and that the next fresh
compiler Worker can execute normally.

The test suite uses `npx playwright install --with-deps chromium firefox webkit`.
The CI gate runs all three projects before uploading the GitHub Pages artifact.
Use `npm run test:e2e` locally after creating the built WASM bridge, or
`npx playwright test --project=firefox` /
`npx playwright test --project=webkit` for a targeted compatibility check.

The Node/Vite browser preview uses the same `/scarp-playground/` base path as
GitHub Pages. `vite preview` serves the built `dist` output.

## What this does **not** establish

These smoke tests cannot certify that all browser versions or configurations
work, that WebAssembly has an independent process memory quota, or that worker
termination can always recover from browser-engine OOM. They do not test
mobile Safari hardware, cross-origin isolation response headers, operating
system resource quotas, arbitrary hostile source or comprehensive compiler
fuzzing. The production CSP is a *document meta policy* on a static host:
Workers loaded by URL do not inherit it automatically.

Keep [security issue #3](https://github.com/scarp-lang/scarp-playground/issues/3)
open for independent review, memory-pressure telemetry, WASM panic
investigation, supply-chain audits and the incident response plan.
