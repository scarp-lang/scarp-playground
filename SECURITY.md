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
