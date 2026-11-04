# Content Security Policy — static GitHub Pages preview

**Status:** a preventative browser policy for the live development preview,
not a security certification or proof of safe execution of hostile Scarp code.

## Deployment constraint

The official Playground is a static Vite application deployed to GitHub Pages.
The repository cannot configure arbitrary HTTP response headers on this hosting
path. The build therefore inserts a `Content-Security-Policy` **meta tag**
into `dist/index.html` immediately after the charset declaration, before any
executing application script. Vite dev/HMR is intentionally exempt because it
needs development-only runtime script behavior. Never advertise the production
CSP as being enforced by `npm run dev`.

The actual policy is defined in `vite.config.ts`, and
`scripts/check-bundle.mjs` fails production builds when the emitted HTML has
no early meta tag, omits a required directive, or enables unrestricted script
evaluation or inline JavaScript. A real Chromium browser test checks that the
policy blocks a dynamically injected inline script **while** actual Monaco
editing and Scarp Rust/WebAssembly execution still work.

## Directives and necessary exceptions

| Directive | Production intent |
| --- | --- |
| `default-src 'none'` | Deny unspecified resource classes |
| `script-src 'self' 'wasm-unsafe-eval'` | Same-origin application scripts and real browser WASM compilation, without general `unsafe-eval` or inline JavaScript |
| `worker-src 'self'` | Load only bundled same-origin Scarp and Monaco workers, not blob/data/remote workers |
| `connect-src 'self'` | Fetch only same-origin compiler/WebAssembly and other static assets |
| `style-src 'self' 'unsafe-inline'` | Allow Monaco's programmatic editor styles and built CSS; its inline-style requirement is a documented exception |
| `img-src 'self' data:`, `font-src 'self' data:` | Same-origin assets and embedded icon/font data |
| `object-src 'none'`, `frame-src 'none'` | Prevent plugin/object and embedded frame resource loading |
| `form-action 'none'`, `base-uri 'none'` | Forbid form submission and a document base URL |
| `manifest-src 'self'` | Limit future manifest loads to the application origin |

**CSP is not a general isolation boundary.** A `meta` policy cannot enforce
`frame-ancestors` (framing prevention), `sandbox`, or a true HTTP
`Content-Security-Policy-Report-Only` header. The host's other headers also
remain outside this repository's control. If the app migrates to a host with
configurable response headers, enforce the policy from HTTP headers and assess
`frame-ancestors`, reporting, COOP/COEP and cross-origin isolation then.

Because the code runs in normal browser workers and JavaScript/WASM, the CSP
does **not** cap WebAssembly linear memory or protect against browser engine
vulnerabilities, logic errors, or hostile unbounded programs. Scarp budgets,
worker termination and input-size limits remain separate safeguards. Do not
paste secrets or use the preview as a secure sandbox.

## Regression and future changes

Each pull request must retain a **locked** native Rust test suite, a
`wasm-pack --locked` compilation, production bundle checks and the full
Chromium suite. `tests/e2e/csp.spec.ts` exercises the built HTML rather than
the unprotected Vite development server. On introducing fonts, remote
resources, asset workers or editor changes, review every proposed CSP
relaxation; do not add `'unsafe-eval'`, remote script origins or `blob:`
workers just to silence a test without a concrete threat assessment.

This completes only the CSP implementation slice of security issue #3.
Browser memory-pressure testing, cross-browser validation, supply-chain audit
and an independent security review remain open before stable `v1.0.0`.
