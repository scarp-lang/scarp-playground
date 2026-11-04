# Security policy

Scarp Playground is **experimental**. Browser user programs run via the
official interpreter compiled to WebAssembly, in a disposable Web Worker.

The worker is terminated on a 12-second deadline. Source bytes, virtual files,
imports, interpreter work, calls, output size and allocation budgets are
limited, but the browser does not enforce an independent strict memory cap.

Do not paste passwords, tokens, private code or sensitive information into
untrusted sites. This project has no remote code execution service and should
not add one without dedicated review.

Please open a non-sensitive security report through the repository's GitHub
security advisory interface rather than a public issue.

## Input and result protocol checks

The Rust bridge rejects raw JSON requests larger than **1 MiB** before
deserialization. The browser also validates a 128 KiB total source budget.
The disposable Worker rejects compiler replies larger than 8 MiB of raw JSON
text before parsing them. Worker and main-thread checks enforce a combined
1 MiB stdout/stderr UTF-8 limit and validate schema-1 diagnostic locations
before rendering. Invalid worker messages and cloning failures produce
controlled errors and worker termination.

**These are not a hardened sandbox.** No independent process memory cap,
out-of-memory recovery guarantee, or browser-engine isolation guarantee is
provided. The 12-second timeout cannot stop arbitrary synchronous allocations.
Issue #3 continues to track CSP, memory stress, dependency and independent
security reviews.
