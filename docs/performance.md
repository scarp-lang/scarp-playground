# Scarp Playground bundle performance — 2026-11-03

The released v0.0.1 browser build imported `monaco-editor` from its package
root and generated 88 JavaScript files, including many syntax definitions for
languages the Scarp editor does not use. The optimization in PR #8 imports
Monaco's editor-only ESM API, retains the editor feature set and lazy-loads
the editor from React.

## Measurement method

The baseline was derived from Vite's asset size output in the successful
main-branch CI run **41627549603**. The optimized results were captured by
`npm run analyze:bundle` in PR CI run **41630467775**. Both use Node 22,
locked npm dependencies and the same Rust/WASM compiler revision.

| Metric | Before | After |
| --- | ---: | ---: |
| Modules transformed | 1,082 | 889 |
| JS assets emitted | 88 | 4 |
| Total JS raw | approximately 4.32 MB | 3.71 MB |
| React entry JS raw | approximately 3.54 MB | 235,252 bytes |
| React entry JS gzip | approximately 925 KB | 74,000 bytes |
| Monaco editor JS | bundled with entry | 3,238,396 bytes, lazy loaded |
| Chromium checks | 6 | 7 |

The actual shipped WASM and worker remain included. Monaco still needs to
download when the editor is displayed; **this is a smaller initial application
chunk, not a reduction of the total editor runtime to 74 KB**. These are build
figures, not measured first-paint timings or internet transfer timings.

## Regression guards

`npm run build` writes `dist/bundle-report.json` with JS asset count,
aggregate sizes and top files. It rejects unrelated stock-language chunks and
fails if the initial application JS is missing or larger than 400 KiB.
This threshold applies to our pinned Monaco dependency and must be reviewed
if the dependency is intentionally upgraded.

Browser E2E tests use the actual compiled Scarp interpreter, validate typing
in Monaco, and test the existing hello/import/error/limits/theme/mobile flows.
